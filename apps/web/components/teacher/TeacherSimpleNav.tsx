"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";

function isActive(pathname: string) {
  return pathname === "/teacher";
}

export function TeacherSimpleNav() {
  const pathname = usePathname();
  const { signOut } = useClerk();

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/teacher"
            aria-current={isActive(pathname) ? "page" : undefined}
            className={
              isActive(pathname)
                ? "inline-flex h-14 items-center border-b-2 border-indigo-600 px-1 text-sm font-medium text-gray-900"
                : "inline-flex h-14 items-center border-b-2 border-transparent px-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }
          >
            Today
          </Link>
        </div>

        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
