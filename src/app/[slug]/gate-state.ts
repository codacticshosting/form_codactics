export interface GateState {
  status: "idle" | "error" | "success";
  message?: string;
  // Set on success — which access-code username actually logged in, so the
  // form can filter any per-user-restricted sections.
  username?: string;
}

export const initialGateState: GateState = { status: "idle" };
