export type SubmitState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialSubmitState: SubmitState = { status: "idle" };
