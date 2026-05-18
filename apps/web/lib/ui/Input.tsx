import type { CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { colors, motion, radii, space, typography } from "./tokens";

interface FieldProps {
  label?: ReactNode;
  helpText?: ReactNode;
  /** Error message renders in danger tones below the field. */
  error?: ReactNode;
  /** Visual hint that the field is required. Doesn't add `required` itself. */
  optional?: boolean;
  id?: string;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

const fieldBase: CSSProperties = {
  width: "100%",
  fontFamily: typography.fontSans,
  ...typography.size.base,
  color: colors.text,
  background: colors.bg,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  padding: `${space[2]} ${space[3]}`,
  outline: "none",
  transition: `border-color ${motion.fast}, box-shadow ${motion.fast}`,
};

function FieldLabel({
  htmlFor,
  optional,
  children,
}: {
  htmlFor?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "flex",
        gap: space[2],
        alignItems: "baseline",
        marginBottom: space[2],
        color: colors.text,
        ...typography.size.md,
        fontWeight: typography.weight.medium,
      }}
    >
      <span>{children}</span>
      {optional ? (
        <span
          style={{
            ...typography.size.xs,
            color: colors.textMuted,
            fontWeight: typography.weight.regular,
          }}
        >
          optional
        </span>
      ) : null}
    </label>
  );
}

function FieldFooter({ error, help }: { error?: ReactNode; help?: ReactNode }) {
  if (error) {
    return (
      <p
        style={{
          margin: `${space[2]} 0 0 0`,
          color: colors.danger,
          ...typography.size.sm,
        }}
      >
        {error}
      </p>
    );
  }
  if (help) {
    return (
      <p
        style={{
          margin: `${space[2]} 0 0 0`,
          color: colors.textMuted,
          ...typography.size.sm,
        }}
      >
        {help}
      </p>
    );
  }
  return null;
}

export function Input({
  label,
  helpText,
  error,
  optional,
  id,
  className: _ignoredClassName,
  ...rest
}: InputProps) {
  void _ignoredClassName;
  return (
    <div style={{ width: "100%" }}>
      {label ? (
        <FieldLabel htmlFor={id} optional={optional}>
          {label}
        </FieldLabel>
      ) : null}
      <input
        id={id}
        {...rest}
        style={{
          ...fieldBase,
          borderColor: error ? colors.danger : fieldBase.borderColor,
        }}
      />
      <FieldFooter error={error} help={helpText} />
    </div>
  );
}

export function Textarea({
  label,
  helpText,
  error,
  optional,
  id,
  rows = 6,
  className: _ignoredClassName,
  ...rest
}: TextareaProps) {
  void _ignoredClassName;
  return (
    <div style={{ width: "100%" }}>
      {label ? (
        <FieldLabel htmlFor={id} optional={optional}>
          {label}
        </FieldLabel>
      ) : null}
      <textarea
        id={id}
        rows={rows}
        {...rest}
        style={{
          ...fieldBase,
          fontFamily: typography.fontMono,
          ...typography.size.md,
          resize: "vertical",
          borderColor: error ? colors.danger : fieldBase.borderColor,
        }}
      />
      <FieldFooter error={error} help={helpText} />
    </div>
  );
}
