const fs = require('fs');
const path = require('path');
const WebInvitation = require('../models/WebInvitation');
const { sendOtpEmail, sendVerificationEmail, sendRSVPEmail, sendResetCodeEmail } = require('../utils/sendEmail');

// In-memory OTP store (keyed by email)
const otps = new Map();

// In-memory reset code store (keyed by email)
const resetCodes = new Map();

// Generate unique slug
const generateSlug = async (groomName, brideName) => {
  const baseSlug = `${groomName}weds${brideName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  let slug = baseSlug;
  let isUnique = false;

  while (!isUnique) {
    const existing = await WebInvitation.findOne({ slug });
    if (!existing) {
      isUnique = true;
    } else {
      // Append a random 4-digit number to make it unique
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      slug = `${baseSlug}${randomNum}`;
    }
  }

  return slug;
};

// @desc    Request OTP for Web Invitation
// @route   POST /api/web-invitations/request-otp
// @access  Public
const requestOtp = async (req, res) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if email already exists
  const existingInvitation = await WebInvitation.findOne({ email: normalizedEmail });
  if (existingInvitation) {
    return res.status(409).json({ 
      success: false, 
      message: 'This email is already associated with an existing invitation. Please delete the existing invitation first before creating a new one.',
      existingSlug: existingInvitation.slug
    });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otps.set(normalizedEmail, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  });

  try {
    await sendOtpEmail(normalizedEmail, code);
  } catch (err) {
    // Remove the OTP since the email wasn't delivered
    otps.delete(normalizedEmail);
    console.error('❌ OTP email error:', err.message);
    return res.status(503).json({
      success: false,
      message: 'Could not send verification email. Please check your email address and try again shortly.'
    });
  }

  return res.status(200).json({ success: true, message: 'Verification code sent to your email' });
};

// @desc    Verify OTP and Create Web Invitation
// @route   POST /api/web-invitations/verify-and-create
// @access  Public
const verifyAndCreateInvitation = async (req, res) => {
  const { brideName, groomName, email, whatsappNumber, weddingDate, description, template, otp, password } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: 'Email and verification code are required' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const storedOtp = otps.get(normalizedEmail);
  if (!storedOtp || storedOtp.code !== otp || storedOtp.expiresAt < Date.now()) {
    return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
  }

  // Clear OTP
  otps.delete(normalizedEmail);

  // Check if email already exists
  const existingInvitation = await WebInvitation.findOne({ email: normalizedEmail });
  if (existingInvitation) {
    return res.status(409).json({ 
      success: false, 
      message: 'This email is already associated with an existing invitation. Please delete the existing invitation first before creating a new one.',
      existingSlug: existingInvitation.slug
    });
  }

  let events = req.body.events;
  if (typeof events === 'string') {
    try { events = JSON.parse(events); } catch (e) { events = []; }
  }

  // Handle media files - check if Cloudinary is being used
  const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME &&
                       process.env.CLOUDINARY_API_KEY &&
                       process.env.CLOUDINARY_API_SECRET &&
                       process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

  let mediaFiles = [];
  if (req.files && req.files.length > 0) {
    if (useCloudinary) {
      // Cloudinary provides URLs in file.path
      mediaFiles = req.files.map((file) => file.path);
    } else {
      // Local storage - construct full URLs
      mediaFiles = req.files.map((f) => `${req.protocol}://${req.get('host')}/uploads/user_uploads/${f.filename}`);
    }
  }

  if (!brideName || !groomName) {
    return res.status(400).json({ success: false, message: 'brideName and groomName are required' });
  }

  if (events && !Array.isArray(events)) {
    return res.status(400).json({ success: false, message: 'events must be an array' });
  }

  // Generate unique slug
  const slug = await generateSlug(groomName, brideName);

  const invitation = await WebInvitation.create({
    slug,
    email: normalizedEmail,
    password,
    whatsappNumber: whatsappNumber ? whatsappNumber.trim() : '',
    brideName,
    groomName,
    weddingDate,
    description,
    events,
    media: mediaFiles,
    template
  });

  // Send "invitation is live" notification email
  const inviteUrl = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/${slug}`;
  await sendVerificationEmail(normalizedEmail, `${brideName} & ${groomName}`, inviteUrl);

  const token = Buffer.from(`${invitation._id}:${Date.now()}`).toString('base64');

  return res.status(201).json({
    success: true,
    token,
    slug: invitation.slug,
    invitation: {
      slug: invitation.slug,
      brideName: invitation.brideName,
      groomName: invitation.groomName,
      email: invitation.email
    }
  });
};

// @desc    Get Invitation by Slug
// @route   GET /api/web-invitations/:slug
// @access  Public
const getInvitationBySlug = async (req, res) => {
  const { slug } = req.params;

  const invitation = await WebInvitation.findOne({ slug });

  if (!invitation) {
    return res.status(404).json({ success: false, message: 'Invitation not found' });
  }

  return res.status(200).json({
    success: true,
    data: invitation
  });
};

const parseReferrerSource = (referrer, host) => {
  if (!referrer) return 'Direct';
  try {
    const url = new URL(referrer);
    const hostname = url.hostname.replace(/^www\./, '');
    if (!hostname || hostname === host || hostname.includes('localhost')) {
      return 'Direct';
    }
    return hostname;
  } catch (error) {
    return 'Direct';
  }
};

const trackInvitationView = async (req, res) => {
  const { slug } = req.params;
  const { referrer } = req.body;

  const invitation = await WebInvitation.findOne({ slug });
  if (!invitation) {
    return res.status(404).json({ success: false, message: 'Invitation not found' });
  }

  const source = parseReferrerSource(referrer || req.headers.referer, req.get('host'));
  const existingCounts = invitation.traffic?.sourceCounts || new Map();
  const countsMap = existingCounts instanceof Map ? existingCounts : new Map(Object.entries(existingCounts));
  const currentCount = countsMap.get(source) || 0;
  countsMap.set(source, currentCount + 1);

  invitation.traffic = invitation.traffic || {};
  invitation.traffic.totalViews = (invitation.traffic.totalViews || 0) + 1;
  invitation.traffic.sourceCounts = countsMap;
  invitation.traffic.visits = invitation.traffic.visits || [];
  invitation.traffic.visits.unshift({
    date: new Date(),
    source,
    page: 'invitation',
    ip: req.ip || '',
    userAgent: req.headers['user-agent'] || ''
  });

  if (invitation.traffic.visits.length > 20) {
    invitation.traffic.visits = invitation.traffic.visits.slice(0, 20);
  }

  await invitation.save();

  return res.status(200).json({ success: true, message: 'Traffic recorded' });
};

const getTrafficSummary = async (req, res) => {
  const invitations = await WebInvitation.find().select('slug brideName groomName traffic').lean();
  const summary = invitations.map((invitation) => {
    const sources = invitation.traffic?.sourceCounts || {};
    const sourceCounts = sources instanceof Map ? Object.fromEntries(sources) : sources;
    const visits = invitation.traffic?.visits || [];
    return {
      slug: invitation.slug,
      couple: `${invitation.brideName} & ${invitation.groomName}`,
      totalViews: invitation.traffic?.totalViews || 0,
      sourceCounts,
      lastVisitAt: visits.length > 0 ? visits[0].date : null,
    };
  });

  const totalAudience = summary.reduce((sum, item) => sum + item.totalViews, 0);

  return res.status(200).json({
    success: true,
    data: {
      totalAudience,
      invitations: summary,
    }
  });
};

// @desc    Get All Invitations (optional admin use)
// @route   GET /api/web-invitations
// @access  Public (or restrict to admin)
const getAllInvitations = async (req, res) => {
  const invitations = await WebInvitation.find().sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: invitations.length,
    data: invitations
  });
};

const TEMPLATE_PATHS = {
  template1: 'Colorlib template No.1/preview.colorlib.com/theme/weddingdreams/index.html',
  template2: 'Weddings Temp2/preview.colorlib.com/theme/wedding2/index.html',
  template3: 'Weddings Temp3/preview.colorlib.com/theme/dreamwed/index.html',
  template4: 'Weddings Temp4/preview.colorlib.com/theme/wed/index.html',
  template5: 'Wedding Temp 5/preview.colorlib.com/theme/twohearts/index.html',
  template6: 'Wedding Temp6/preview.colorlib.com/theme/hookup/index.html',
  template7: 'Weddings Temp7/preview.colorlib.com/theme/honey/index.html',
};

const renderInvitationTemplate = (templateId, invitation) => {
  const relativePath = TEMPLATE_PATHS[templateId] || TEMPLATE_PATHS.template1;
  const templatePath = path.join(__dirname, '../templates', relativePath);
  let html = fs.readFileSync(templatePath, 'utf8');

  const brideName = invitation.brideName || 'Bride';
  const groomName = invitation.groomName || 'Groom';

  html = html.replace(/\[Bride Name\]/g, brideName);
  html = html.replace(/\[Groom Name\]/g, groomName);
  html = html.replace(/\bBride\b/gi, brideName);
  html = html.replace(/\bGroom\b/gi, groomName);
  html = html.replace(/\bLeonardo\b/gi, groomName);
  html = html.replace(/\bMarianna\b/gi, brideName);

  const formattedDate = invitation.weddingDate
    ? new Date(invitation.weddingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'TBA';

  html = html.replace(/\[Wedding Date Placeholder\]/g, formattedDate);
  html = html.replace(/23 SETPEMBER 2017/g, formattedDate);
  html = html.replace(/September 19th, 2020/g, formattedDate);
  html = html.replace(/january 23/gi, formattedDate);

  html = html.replace(/\[Short Description Placeholder\]/g, invitation.description || 'Welcome to our wedding!');
  html = html.replace(/\[Full Story Placeholder\]/g, invitation.description || 'Welcome to our wedding!');

  // Replace media placeholders with user's uploaded images
  if (invitation.media && invitation.media.length > 0) {
    let mediaIndex = 0;

    // Helper to get next media, cycling through available
    const getNextMedia = () => {
      const url = invitation.media[mediaIndex % invitation.media.length];
      mediaIndex++;
      return url;
    };

    // 1. Replace story images
    if (invitation.media[0]) {
      html = html.replace(/img\/story\/story-1\.jpg/g, invitation.media[0]);
      html = html.replace(/img\/story-pic\.png/g, invitation.media[0]);
    }
    if (invitation.media[1]) {
      html = html.replace(/img\/story\/story-2\.jpg/g, invitation.media[1]);
    }

    // 2. Replace ALL gallery image patterns cycle-by-cycle (not by numbered placeholder)
    // This finds EVERY gallery image in the HTML and cycles through media files
    
    // Replace src attributes with gallery images
    const srcMatches = [];
    let srcRegex = /<img[^>]*src="([^"]*gallery[^"]*\.(jpg|png|jpeg|webp))"[^>]*>/gi;
    let srcMatch;
    while ((srcMatch = srcRegex.exec(html)) !== null) {
      srcMatches.push({ match: srcMatch[0], src: srcMatch[1], index: srcMatch.index });
    }
    
    // Replace each src match individually with cycling media
    srcMatches.forEach((item) => {
      const newMedia = getNextMedia();
      const newTag = item.match.replace(item.src, newMedia);
      html = html.substring(0, item.index) + newTag + html.substring(item.index + item.match.length);
      // After replacement, we need to recalculate indices, so let's use a different approach
    });

    // Better approach: replace all gallery placeholders individually
    html = html.replace(/(<img[^>]*src=")([^"]*gallery[^"]*\.(jpg|png|jpeg|webp))("[^>]*>)/gi, (match, prefix, src, ext, suffix) => {
      if (src.startsWith('http') || src.includes('/uploads/')) return match; // Skip already replaced
      return prefix + getNextMedia() + ext + suffix;
    });

    // 3. Replace href attributes for gallery links
    html = html.replace(/(<a[^>]*href=")([^"]*gallery[^"]*\.(jpg|png|jpeg|webp))("[^>]*>)/gi, (match, prefix, href, ext, suffix) => {
      if (href.startsWith('http') || href.includes('/uploads/')) return match;
      return prefix + getNextMedia() + ext + suffix;
    });

    // 4. Replace background-image URLs
    html = html.replace(/(background-image:\s*url\()([^)]*gallery[^)]*\.(?:jpg|png|jpeg|webp))(\))/gi, (match, prefix, url, suffix) => {
      if (url.toLowerCase().startsWith('http') || url.includes('/uploads/')) return match;
      return prefix + getNextMedia() + suffix;
    });

    // 5. Replace data-setbg attributes
    html = html.replace(/(data-setbg=")([^"]*gallery[^"]*\.(jpg|png|jpeg|webp))(")/gi, (match, prefix, src, suffix) => {
      if (src.startsWith('http') || src.includes('/uploads/')) return match;
      return prefix + getNextMedia() + suffix;
    });

    // 6. Replace data-background attributes
    html = html.replace(/(data-background=")([^"]*gallery[^"]*\.(jpg|png|jpeg|webp))(")/gi, (match, prefix, src, suffix) => {
      if (src.startsWith('http') || src.includes('/uploads/')) return match;
      return prefix + getNextMedia() + suffix;
    });
  }

  if (html.includes('<!-- EVENTS_PLACEHOLDER -->')) {
    let eventsHtml = '';
    if (invitation.events && invitation.events.length > 0) {
      invitation.events.forEach((event, index) => {
        if (templateId === 'template1') {
          eventsHtml += `
            <div class="col-lg-4 col-md-6 col-sm-6">
                <div class="services__item">
                    <img src="img/icon/si-3.png" alt="" loading="lazy" decoding="async">
                    <h4 class="event-name">${event.name}</h4>
                    <p class="event-date-time"><strong>Date:</strong> ${event.date}<br><strong>Time:</strong> ${event.time}</p>
                    <p class="event-venue"><strong>Venue:</strong> ${event.venue}</p>
                </div>
            </div>
            `;
        } else if (templateId === 'template2') {
          const alignment = index % 2 === 0 ? 'right' : 'left';
          const icon = index % 2 === 0 ? 'icon-ciurclke' : 'icon-wine-glass';
          eventsHtml += `
            <div class="w-detail ${alignment}">
                <i class="icon ${icon}"></i>
                <h4 class="title">${event.name}</h4>
                <p><strong>Date:</strong> ${event.date} <br/> <strong>Time:</strong> ${event.time} <br/> <strong>Venue:</strong> ${event.venue}</p>
            </div>
            `;
        } else if (templateId === 'template3') {
          const icons = ['ei-1.png', 'ei-2.png', 'ei-3.png', 'ei-4.png', 'ei-5.png'];
          const iconImg = icons[index % icons.length];
          eventsHtml += `
            <div class="event__item">
                <div class="event__item__icon">
                    <img src="img/event/${iconImg}" alt="" loading="lazy" decoding="async">
                </div>
                <span>${event.time}</span>
                <h3>${event.name}</h3>
                <p><strong>Venue:</strong> ${event.venue} <br/> <strong>Date:</strong> ${event.date}</p>
            </div>
            `;
        } else if (templateId === 'template4') {
          const icons = ['flaticon-chart', 'flaticon-project', 'flaticon-award'];
          const iconClass = icons[index % icons.length];
          eventsHtml += `
            <div class="col-xl-4 col-lg-4 col-md-6">
                <div class="single-card text-center mb-30 ${index === 1 ? 'active' : ''}">
                    <div class="card-top">
                        <span class="${iconClass}"></span>
                        <h4>${event.name}</h4>
                    </div>
                    <div class="card-bottom">
                        <ul>
                            <li><i class="fas fa-calendar-alt"></i>${event.date}</li>
                            <li><i class="far fa-clock"></i>${event.time}</li>
                            <li><i class="fas fa-map-marker-alt"></i>${event.venue}</li>
                        </ul>
                    </div>
                </div>
            </div>
            `;
        } else if (templateId === 'template7') {
          const icons = ['progress-1.png', 'progress-2.png', 'progress-3.png', 'progress-4.png'];
          const iconImg = icons[index % icons.length];
          eventsHtml += `
            <div class="col-lg-4 col-md-6 mb-4">
                <div class="event_card" style="border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.08); transition: transform 0.3s ease; border-bottom: 4px solid #ff2f92;">
                    <div style="position: relative;">
                        <img class="img-fluid w-100" src="img/progress/${iconImg}" alt="${event.name}" style="height: 220px; object-fit: cover;" loading="lazy">
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.85), transparent); padding: 20px 15px 10px;">
                            <h4 style="color: #fff; margin: 0; font-family: 'Playfair Display', serif; font-size: 22px; font-weight: bold;">${event.name}</h4>
                        </div>
                    </div>
                    <div class="event_card_body" style="padding: 25px 20px;">
                        <p style="margin-bottom: 15px; color: #555; font-size: 15px; line-height: 1.6;">
                            <i class="fa fa-map-marker" style="color: #ff2f92; margin-right: 10px; font-size: 18px; width: 14px; text-align: center;"></i> 
                            ${event.venue}
                        </p>
                        <hr style="border-top: 1px dashed #eee; margin: 15px 0;">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <span style="color: #777; font-size: 14px; font-family: 'Roboto', sans-serif;">
                                <i class="fa fa-calendar" style="color: #ff2f92; margin-right: 10px; width: 14px; text-align: center;"></i> 
                                ${event.date}
                            </span>
                            <span style="color: #777; font-size: 14px; font-family: 'Roboto', sans-serif;">
                                <i class="fa fa-clock-o" style="color: #ff2f92; margin-right: 10px; width: 14px; text-align: center;"></i> 
                                ${event.time}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }
      });
    }
    html = html.replace('<!-- EVENTS_PLACEHOLDER -->', eventsHtml);
  }

  const templateBaseUrl = `/api/web-invitations/html/templates/${relativePath.split('/index.html')[0]}/`;
  if (!html.includes('<base href=')) {
    html = html.replace(/<head>/i, `<head>\n    <base href="${templateBaseUrl}">`);
  }

  return html;
};

// @desc    Serve Raw HTML template with dynamic data
// @route   GET /api/web-invitations/html/:slug
// @access  Public
const getInvitationHtml = async (req, res) => {
  const { slug } = req.params;
  const invitation = await WebInvitation.findOne({ slug });

  if (!invitation) {
    return res.status(404).send('<h1>Invitation not found</h1>');
  }

  try {
    const html = renderInvitationTemplate(invitation.template || 'template1', invitation);
    res.send(html);
  } catch (err) {
    console.error('Error loading template:', err);
    res.status(500).send('Error loading invitation template.');
  }
};

const previewTemplate = async (req, res) => {
  const { templateId } = req.params;
  const demoInvitation = {
    brideName: 'Ayesha',
    groomName: 'Ahmed',
    weddingDate: 'May 16, 2026',
    description: 'Join us for an evening of love, laughter and celebration as two families become one.',
    events: [
      { name: 'Mehndi', date: 'May 14, 2026', time: '4:00 PM', venue: 'Rose Garden Hall' },
      { name: 'Barat', date: 'May 15, 2026', time: '7:00 PM', venue: 'Grand Palace' },
      { name: 'Walima', date: 'May 17, 2026', time: '6:30 PM', venue: 'Royal Ballroom' },
    ],
  };

  try {
    const html = renderInvitationTemplate(templateId || 'template1', demoInvitation);
    res.send(html);
  } catch (err) {
    console.error('Error previewing template:', err);
    res.status(500).send('Error loading template preview.');
  }
};

// @desc    Handle RSVP Submission
// @route   POST /api/web-invitations/:slug/rsvp
// @access  Public
const handleRSVP = async (req, res) => {
  const { slug } = req.params;
  const { name, whatsappNumber, familyName, side, message } = req.body;

  const invitation = await WebInvitation.findOne({ slug });
  if (!invitation) {
    return res.status(404).json({ success: false, message: 'Invitation not found' });
  }

  // Send RSVP notification via email to the invitation owner
  if (invitation.email) {
    const coupleNames = `${invitation.brideName} & ${invitation.groomName}`;
    await sendRSVPEmail(invitation.email, coupleNames, {
      name,
      email: req.body.email || '',
      familyName,
      whatsappNumber,
      side,
      message
    });
  }

  return res.status(200).json({ success: true, message: 'RSVP submitted successfully' });
};

// @desc    Login to Web Invitation
// @route   POST /api/web-invitations/login
// @access  Public
const loginToInvitation = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const invitation = await WebInvitation.findOne({ email: email.toLowerCase() });
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'No invitation found with this email' });
    }

    const isPasswordValid = await invitation.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    // Create a simple session token (you might want to use JWT for production)
    const token = Buffer.from(`${invitation._id}:${Date.now()}`).toString('base64');

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      invitation: {
        slug: invitation.slug,
        brideName: invitation.brideName,
        groomName: invitation.groomName,
        email: invitation.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update Web Invitation (Authenticated)
// @route   PUT /api/web-invitations/:slug
// @access  Private (Invitation Owner)
const updateInvitation = async (req, res) => {
  const { slug } = req.params;
  const { token, brideName, groomName, whatsappNumber, weddingDate, description, events } = req.body;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    // Decode token (simple validation - in production use proper JWT)
    const decoded = Buffer.from(token, 'base64').toString().split(':');
    const invitationId = decoded[0];

    const invitation = await WebInvitation.findOne({ _id: invitationId, slug });
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found or access denied' });
    }

    // Update fields
    if (brideName) invitation.brideName = brideName;
    if (groomName) invitation.groomName = groomName;
    if (whatsappNumber !== undefined) invitation.whatsappNumber = whatsappNumber;
    if (weddingDate) invitation.weddingDate = weddingDate;
    if (description !== undefined) invitation.description = description;
    if (events) invitation.events = events;

    await invitation.save();

    return res.status(200).json({
      success: true,
      message: 'Invitation updated successfully',
      invitation: {
        slug: invitation.slug,
        brideName: invitation.brideName,
        groomName: invitation.groomName,
        email: invitation.email,
        whatsappNumber: invitation.whatsappNumber,
        weddingDate: invitation.weddingDate,
        description: invitation.description,
        events: invitation.events
      }
    });
  } catch (error) {
    console.error('Update error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Logout from Web Invitation
// @route   POST /api/web-invitations/logout
// @access  Private
const logoutFromInvitation = async (req, res) => {
  // For now, just return success (client will clear localStorage)
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
};

// @desc    Forgot Password - Send Reset Code
// @route   POST /api/web-invitations/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check if invitation exists with this email
    const invitation = await WebInvitation.findOne({ email: normalizedEmail });
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'No invitation found with this email address' });
    }

    // Generate reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes.set(normalizedEmail, {
      code: resetCode,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      invitationId: invitation._id
    });

    // Send reset code via email
    await sendResetCodeEmail(normalizedEmail, resetCode, invitation.brideName, invitation.groomName);

    return res.status(200).json({ success: true, message: 'Password reset code sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    // Clear the reset code if email failed
    resetCodes.delete(normalizedEmail);
    return res.status(503).json({
      success: false,
      message: 'Could not send reset email. Please check your email address and try again shortly.'
    });
  }
};

// @desc    Verify Reset Code
// @route   POST /api/web-invitations/verify-reset-code
// @access  Public
const verifyResetCode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and reset code are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const resetData = resetCodes.get(normalizedEmail);

  if (!resetData || resetData.code !== code || resetData.expiresAt < Date.now()) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
  }

  return res.status(200).json({ success: true, message: 'Reset code verified successfully' });
};

// @desc    Reset Password
// @route   POST /api/web-invitations/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ success: false, message: 'Email, reset code, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const resetData = resetCodes.get(normalizedEmail);

  if (!resetData || resetData.code !== code || resetData.expiresAt < Date.now()) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
  }

  try {
    // Update password
    const invitation = await WebInvitation.findById(resetData.invitationId);
    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    invitation.password = newPassword;
    await invitation.save();

    // Clear reset code
    resetCodes.delete(normalizedEmail);

    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Toggle Disable/Enable Web Invitation
// @route   PUT /api/web-invitations/:slug/toggle-status
// @access  Private (Invitation Owner)
const toggleInvitationStatus = async (req, res) => {
  const { slug } = req.params;
  const { token } = req.body;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    // Decode token (simple validation - in production use proper JWT)
    const decoded = Buffer.from(token, 'base64').toString().split(':');
    const invitationId = decoded[0];

    const invitation = await WebInvitation.findById(invitationId);
    if (!invitation || invitation.slug !== slug) {
      return res.status(404).json({ success: false, message: 'Invitation not found or access denied' });
    }

    invitation.disabled = !invitation.disabled;
    await invitation.save();

    return res.status(200).json({
      success: true,
      message: invitation.disabled ? 'Invitation disabled' : 'Invitation enabled',
      disabled: invitation.disabled
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Delete Web Invitation
// @route   DELETE /api/web-invitations/:slug
// @access  Private (Invitation Owner)
const deleteInvitation = async (req, res) => {
  const { slug } = req.params;
  const { token } = req.body;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    // Decode token (simple validation - in production use proper JWT)
    const decoded = Buffer.from(token, 'base64').toString().split(':');
    const invitationId = decoded[0];

    const invitation = await WebInvitation.findById(invitationId);
    if (!invitation || invitation.slug !== slug) {
      return res.status(404).json({ success: false, message: 'Invitation not found or access denied' });
    }

    await WebInvitation.findByIdAndDelete(invitationId);

    return res.status(200).json({
      success: true,
      message: 'Invitation deleted successfully'
    });
  } catch (error) {
    console.error('Delete invitation error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  requestOtp,
  verifyAndCreateInvitation,
  getInvitationBySlug,
  getAllInvitations,
  getInvitationHtml,
  previewTemplate,
  handleRSVP,
  loginToInvitation,
  updateInvitation,
  logoutFromInvitation,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  trackInvitationView,
  getTrafficSummary,
  toggleInvitationStatus,
  deleteInvitation
};
