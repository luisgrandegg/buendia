"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadAppAction } from "@/app/actions/apps";

export function UploadForm() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (f) setFileName(f.name);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length && fileInputRef.current) {
      fileInputRef.current.files = e.dataTransfer.files;
      handleFiles(e.dataTransfer.files);
    }
  }

  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
  }

  return (
    <form
      action={async (formData) => {
        setPending(true);
        await uploadAppAction(formData);
      }}
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      <label
        htmlFor="html-input"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          display: "block",
          padding: "2.5rem 1rem",
          textAlign: "center",
          border: `2px dashed ${dragOver ? "#111827" : "#d1d5db"}`,
          borderRadius: "0.5rem",
          background: dragOver ? "#f9fafb" : "white",
          cursor: "pointer",
          fontSize: "0.9375rem",
          color: "#374151",
        }}
      >
        {fileName ? (
          <>
            Selected: <strong>{fileName}</strong>
            <div style={{ marginTop: "0.25rem", color: "#6b7280", fontSize: "0.8125rem" }}>
              Drop a different file or click to replace.
            </div>
          </>
        ) : (
          <>
            Drop an <code>index.html</code> here, or click to choose a file.
            <div style={{ marginTop: "0.25rem", color: "#6b7280", fontSize: "0.8125rem" }}>
              Single HTML file only · up to 5 MB.
            </div>
          </>
        )}
        <input
          id="html-input"
          ref={fileInputRef}
          type="file"
          name="html"
          accept=".html,text/html"
          required
          onChange={onFileChange}
          style={{ display: "none" }}
        />
      </label>

      <div>
        <label
          htmlFor="name-input"
          style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.375rem" }}
        >
          App name <span style={{ color: "#6b7280" }}>(optional)</span>
        </label>
        <input
          id="name-input"
          name="name"
          type="text"
          placeholder="Defaults to the file name"
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            border: "1px solid #d1d5db",
            fontSize: "0.9375rem",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="schema-input"
          style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.375rem" }}
        >
          schema.sql <span style={{ color: "#6b7280" }}>(optional)</span>
        </label>
        <textarea
          id="schema-input"
          name="schema_sql"
          rows={6}
          placeholder="Paste your schema.sql here. The provisioner runs it once your app's data lives in your Supabase project (ticket 21)."
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            border: "1px solid #d1d5db",
            fontFamily: "ui-monospace, monospace",
            fontSize: "0.8125rem",
            resize: "vertical",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{
          alignSelf: "flex-start",
          padding: "0.5rem 1rem",
          borderRadius: "0.375rem",
          border: "1px solid #111827",
          background: pending ? "#374151" : "#111827",
          color: "white",
          fontSize: "0.9375rem",
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.8 : 1,
        }}
      >
        {pending ? "Uploading…" : "Upload app"}
      </button>
    </form>
  );
}
