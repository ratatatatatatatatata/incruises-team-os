"use client";

import { useFormStatus } from "react-dom";

export function SetPasswordSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Хадгалж байна…" : "PIN код хадгалах"}
    </button>
  );
}
