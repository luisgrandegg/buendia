import { signOutAction } from "@/app/actions/auth";
import { Button, Row, Text } from "@/lib/ui";

interface AccountMenuProps {
  email: string;
}

export function AccountMenu({ email }: AccountMenuProps) {
  return (
    <form action={signOutAction}>
      <Row gap={3} align="center">
        <Text size="sm" tone="muted">
          {email}
        </Text>
        <Button type="submit" variant="secondary" size="sm">
          Sign out
        </Button>
      </Row>
    </form>
  );
}
