"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Shield, UserRound } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { checkIsSuperAdmin } from "@/lib/super-admin-actions";

export function UserMenu() {
  const { data: session } = useSession();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // super-admins.txt lives on the server (filesystem access, not
  // available in the browser), so this asks a server action rather than
  // checking anything client-side.
  useEffect(() => {
    if (!session?.user) {
      setIsSuperAdmin(false);
      return;
    }
    let cancelled = false;
    checkIsSuperAdmin().then((result) => {
      if (!cancelled) setIsSuperAdmin(result);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-2">
      {session.user.image && (
        <Image
          src={session.user.image}
          alt={session.user.name ?? "Account"}
          width={28}
          height={28}
          className="rounded-full"
        />
      )}
      <span className="hidden max-w-[140px] truncate text-xs font-medium text-royal-700 sm:inline">
        {session.user.name ?? session.user.email}
      </span>
      {isSuperAdmin && (
        <Link
          href="/admin/control-panel"
          className="flex items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
        >
          <Shield size={12} />
          Control panel
        </Link>
      )}
      <Link
        href="/admin/account"
        className="flex items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
      >
        <UserRound size={12} />
        Account
      </Link>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
      >
        Sign out
      </button>
    </div>
  );
}
