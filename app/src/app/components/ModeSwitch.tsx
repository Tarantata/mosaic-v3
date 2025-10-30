"use client";
import * as React from "react";

type Mode = "user" | "admin";
type ModeSetter = React.Dispatch<React.SetStateAction<Mode>>;

type Props = {
  mode: Mode;
  onMode: ModeSetter; // сюда передаём setMode
};

export default function ModeSwitch({ mode, onMode }: Props) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onMode("user")}
        className={mode === "user" ? "font-bold underline" : ""}
      >
        User
      </button>
      <span>/</span>
      <button
        type="button"
        onClick={() => onMode("admin")}
        className={mode === "admin" ? "font-bold underline" : ""}
      >
        Admin
      </button>
    </div>
  );
}
