import jwt from "jsonwebtoken";
import { getGoogleAuthUrl, exchangeCodeAndVerify } from "../services/googleAuth.service.js";


export async function startGoogleLogin(_req, res) {
  const url = getGoogleAuthUrl();
  return res.redirect(url);
}

export async function googleCallback(req, res) {
  try {
    const { code } = req.query;
    console.log("Google callback, code =", code);
    if (!code) return res.status(400).json({ error: "Missing code" });

    const profile = await exchangeCodeAndVerify(code); // { sub, email, name, picture }

    // Issue app JWT (no DB yet)
    const token = jwt.sign(
      {
        google_id: profile.sub,
        email: profile.email,
        name: profile.name,
        picture: profile.picture
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        google_id: profile.sub,
        email: profile.email,
        name: profile.name,
        picture: profile.picture
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err?.message || "Google login failed" });
  }
}
