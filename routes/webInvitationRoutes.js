const express = require('express');
const router = express.Router();
const upload = require('../utils/multer');
const authMiddleware = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/webInvitationController');

// Define routes
router.post('/request-otp', requestOtp);
router.post('/verify-and-create', upload.array('media', 10), verifyAndCreateInvitation);
router.post('/login', loginToInvitation);
router.post('/logout', logoutFromInvitation);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);
router.post('/:slug/rsvp', handleRSVP);
router.post('/:slug/track', trackInvitationView);
router.put('/:slug', updateInvitation);
router.get('/traffic', authMiddleware, getTrafficSummary);
router.get('/', getAllInvitations);
router.get('/preview/:templateId', previewTemplate);
router.get('/html/:slug', getInvitationHtml);
router.get('/:slug', getInvitationBySlug);

router.put('/:slug/toggle-status', toggleInvitationStatus);
router.delete('/:slug', deleteInvitation);

module.exports = router;
