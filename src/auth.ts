import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

// Scopes: identity (openid/email/profile) plus narrow, app-created-file-only
// access to Sheets/Drive — never broad access to the admin's whole Drive.
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Vercel infers the canonical host safely on its own; any other host
  // (Railway, a VM, etc.) needs to be told explicitly to trust the
  // incoming request's host header, or sign-in fails with UntrustedHost.
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          // Forces Google to return a refresh_token on every sign-in, not
          // just the first time — trades a little extra consent-screen
          // friction for never ending up with a dead/missing refresh token.
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      await prisma.admin.upsert({
        where: { email: user.email },
        update: {
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          ...(account?.refresh_token
            ? { googleRefreshToken: account.refresh_token }
            : {}),
        },
        create: {
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          googleRefreshToken: account?.refresh_token ?? null,
        },
      });

      return true;
    },
    async jwt({ token }) {
      if (token.email) {
        const admin = await prisma.admin.findUnique({
          where: { email: token.email },
          select: { id: true },
        });
        if (admin) token.adminId = admin.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.adminId) {
        session.user.id = token.adminId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
