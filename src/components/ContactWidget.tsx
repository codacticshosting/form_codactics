"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import {
  OPEN_CONTACT_WIDGET_EVENT,
  type OpenContactWidgetDetail,
} from "@/lib/contact-widget";

// Frontend-only for now — handleSubmit below is a placeholder. Wherever
// the message actually ends up (mailto, stored via Prisma, emailed
// through a service) still needs to be decided and wired in there.
export function ContactWidget() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  // Lets other parts of the app (e.g. a homepage "Request access" button)
  // open this widget — and optionally pre-fill the message — without any
  // direct prop connection to it.
  useEffect(() => {
    function handleOpenRequest(e: Event) {
      const detail = (e as CustomEvent<OpenContactWidgetDetail>).detail;
      setSubmitted(false);
      if (detail?.prefillMessage) setMessage(detail.prefillMessage);
      setOpen(true);
    }
    window.addEventListener(OPEN_CONTACT_WIDGET_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_CONTACT_WIDGET_EVENT, handleOpenRequest);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: deliver { name, email, message } somewhere real — mailto,
    // a Prisma-stored inbox, or an email service. Not wired up yet.
    setSubmitted(true);
  }

  function resetAndClose() {
    setOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setName("");
      setEmail("");
      setMessage("");
    }, 200);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          ref={panelRef}
          className="flex w-[320px] flex-col overflow-hidden rounded-2xl border border-royal-100 bg-white shadow-2xl sm:w-[360px]"
        >
          <div className="flex items-center justify-between bg-royal-600 px-4 py-3">
            <span className="text-sm font-semibold text-white">
              Codactis Support
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded p-1 text-royal-100 hover:bg-royal-700 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-4 p-4">
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="text-3xl">👋</span>
                <p className="text-sm font-medium text-royal-950">
                  Thanks — we&apos;ll get back to you soon!
                </p>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="text-xs font-medium text-royal-500 hover:underline"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-royal-50 px-3.5 py-2.5 text-sm text-royal-800">
                  👋 Have a question about your form? Send us a message.
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name (optional)"
                    className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Your email"
                    className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                  />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={3}
                    placeholder="How can we help?"
                    className="w-full resize-none rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex items-center justify-center gap-1.5 rounded-full bg-royal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-royal-700"
                  >
                    <Send size={14} />
                    Send message
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close contact widget" : "Open contact widget"}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-royal-600 text-white shadow-lg shadow-royal-600/30 transition-colors hover:bg-royal-700"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
        )}
      </button>
    </div>
  );
}
