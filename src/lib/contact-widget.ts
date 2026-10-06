// A plain browser CustomEvent, not React context — ContactWidget renders
// globally in layout.tsx as a sibling of every page's content, so there's
// no prop channel to reach it from e.g. the homepage. This is the
// lightest way to say "open yourself" from anywhere in the app.
export const OPEN_CONTACT_WIDGET_EVENT = "codactis:open-contact-widget";

export interface OpenContactWidgetDetail {
  prefillMessage?: string;
}

export function openContactWidget(prefillMessage?: string) {
  window.dispatchEvent(
    new CustomEvent<OpenContactWidgetDetail>(OPEN_CONTACT_WIDGET_EVENT, {
      detail: { prefillMessage },
    }),
  );
}
