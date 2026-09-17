"use client";

import { useState } from "react";

export function LoginCredentialField() {
  const [useLegacyPassword, setUseLegacyPassword] = useState(false);

  return (
    <>
      {useLegacyPassword ? (
        <label>
          Хуучин нууц үг
          <input
            key="legacy-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={128}
            enterKeyHint="go"
          />
        </label>
      ) : (
        <label>
          8 оронтой PIN
          <input
            key="eight-digit-pin"
            name="password"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{8}"
            autoComplete="current-password"
            required
            minLength={8}
            maxLength={8}
            enterKeyHint="go"
          />
        </label>
      )}
      <button
        className="text-button light login-password-mode"
        type="button"
        aria-pressed={useLegacyPassword}
        onClick={() => setUseLegacyPassword((current) => !current)}
      >
        {useLegacyPassword ? "8 оронтой PIN ашиглах" : "Хуучин нууц үгээр нэвтрэх"}
      </button>
    </>
  );
}
