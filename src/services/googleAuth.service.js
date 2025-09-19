import { OAuth2Client } from "google-auth-library";

const oauth = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export function getGoogleAuthUrl() {
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["openid", "email", "profile"]
  });
}

export async function exchangeCodeAndVerify(code) {
  const { tokens } = await oauth.getToken(code);
  if (!tokens?.id_token) throw new Error("No id_token returned");

  const ticket = await oauth.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error("Missing email in Google profile");

  // Return the minimum we need
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  };
}
