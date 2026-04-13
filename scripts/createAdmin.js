'use strict';

const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../config/db');
const Admin = require('../models/Admin');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => {
    rl.question(question, resolve);
  });

const main = async () => {
  try {
    await connectDB();

    const [emailArg, passwordArg] = process.argv.slice(2);
    const email = (emailArg || (await ask('Admin email: '))).trim();
    const password = (passwordArg || (await ask('Admin password: '))).trim();

    if (!email || !password) {
      console.error('Email and password are required.');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('Password must be at least 8 characters long.');
      process.exit(1);
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.error(`Admin with email "${email}" already exists.`);
      process.exit(1);
    }

    await Admin.create({ email, password });
    console.log(`✅ Admin created: ${email}`);
  } catch (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
};

main();
