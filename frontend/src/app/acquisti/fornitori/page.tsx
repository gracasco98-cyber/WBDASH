"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FornitoriPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/acquisti/anagrafiche"); }, [router]);
  return null;
}
