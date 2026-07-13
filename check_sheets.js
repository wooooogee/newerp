import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function checkSheets() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "test@test.com",
        // This won't work because it's using OAuth2 with user login, not Service Account.
      }
    });
  } catch (e) {
    console.error(e);
  }
}
checkSheets();
