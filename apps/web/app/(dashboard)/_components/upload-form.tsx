"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadAppAction } from "@/app/actions/apps";
import {
  Button,
  CodeBlock,
  Input,
  Stack,
  Text,
  Textarea,
  colors,
  motion,
  radii,
  space,
  typography,
} from "@/lib/ui";

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
    >
      <Stack gap={5}>
        <label
          htmlFor="html-input"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          style={{
            display: "block",
            padding: `${space[10]} ${space[6]}`,
            textAlign: "center",
            border: `2px dashed ${dragOver ? colors.accent : colors.borderStrong}`,
            borderRadius: radii.lg,
            background: dragOver ? colors.accentBgSoft : colors.bg,
            cursor: "pointer",
            transition: `border-color ${motion.fast}, background ${motion.fast}`,
            ...typography.size.base,
            color: colors.text,
          }}
        >
          {fileName ? (
            <>
              <div style={{ fontWeight: typography.weight.medium }}>{fileName}</div>
              <Text size="sm" tone="muted" style={{ marginTop: space[1] }}>
                Drop a different file or click to replace.
              </Text>
            </>
          ) : (
            <>
              <div>
                Drop an <CodeBlock inline>index.html</CodeBlock> here, or click to choose a file.
              </div>
              <Text size="sm" tone="muted" style={{ marginTop: space[1] }}>
                Single HTML file · up to 5 MB.
              </Text>
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

        <Input
          id="name-input"
          name="name"
          type="text"
          label="App name"
          optional
          placeholder="Defaults to the file name"
        />

        <Textarea
          id="schema-input"
          name="schema_sql"
          label="schema.sql"
          optional
          rows={6}
          placeholder="Optional Postgres DDL. Buendia mounts it inside an app_<slug> schema in your Supabase project once you provision."
          helpText={
            <>
              Plain DDL only — no <CodeBlock inline>public.</CodeBlock> prefix, no{" "}
              <CodeBlock inline>grant</CodeBlock>, no <CodeBlock inline>disable rls</CodeBlock>.
            </>
          }
        />

        <Button
          type="submit"
          variant="primary"
          disabled={pending}
          style={{ alignSelf: "flex-start" }}
        >
          {pending ? "Uploading…" : "Upload app"}
        </Button>
      </Stack>
    </form>
  );
}
