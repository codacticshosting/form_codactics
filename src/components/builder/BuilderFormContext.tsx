"use client";

import { createContext, useContext } from "react";

// The id of the form being edited in the builder — null until the form has
// been saved (an anonymous, not-yet-signed-in draft). Lets field editors
// deep inside the canvas (attachments) upload files to the right form
// without threading the id through every component in between.
export const BuilderFormIdContext = createContext<string | null>(null);

export function useBuilderFormId(): string | null {
  return useContext(BuilderFormIdContext);
}
