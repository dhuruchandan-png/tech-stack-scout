import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

export type BriefItem = { name: string; domain: string; reason: string; opener: string | null };

type Props = {
  top: BriefItem[]; changes: { company: string; text: string }[]; ready: number; problems: string[];
  baseUrl: string; intendedFor: string | null;
};

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const serif = "Georgia, 'Times New Roman', serif";
const label = { fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", color: "#5A6B7D", margin: "22px 0 6px" } as const;

export default function MondayBriefEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your top accounts to call this week</Preview>
      <Body style={{ background: "#F7F8FA", fontFamily: "Helvetica, Arial, sans-serif", color: "#0E1621", margin: 0, padding: "24px 0" }}>
        <Container style={{ background: "#FFFFFF", border: "1px solid #E3E8EE", borderRadius: 10, padding: 28, maxWidth: 620 }}>
          <Text style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", color: "#0F9F8E", margin: 0 }}>TECH STACK SCOUT · MONDAY BRIEF</Text>
          {p.intendedFor && <Text style={{ fontSize: 12, color: "#5A6B7D" }}>Test mode: intended for {p.intendedFor}</Text>}
          <Heading style={{ fontFamily: serif, fontSize: 28, margin: "10px 0" }}>Call these first</Heading>

          {p.top.map((t) => (
            <Section key={t.domain} style={{ borderTop: "1px solid #E3E8EE", padding: "12px 0" }}>
              <Text style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                <Link href={`${p.baseUrl}/accounts/${t.domain}`} style={{ color: "#0E1621" }}>{t.name}</Link>
              </Text>
              <Text style={{ fontSize: 13, color: "#5A6B7D", margin: "2px 0 6px" }}>{t.reason}</Text>
              {t.opener && <Text style={{ fontFamily: serif, fontSize: 15, lineHeight: "22px", margin: 0, color: "#3a2fa8" }}>“{t.opener}”</Text>}
            </Section>
          ))}

          <Text style={label}>WHAT CHANGED THIS WEEK</Text>
          {p.changes.length === 0 && <Text style={{ fontSize: 13 }}>No material changes.</Text>}
          {p.changes.map((c, i) => (
            <Text key={i} style={{ fontFamily: mono, fontSize: 12, margin: "3px 0" }}>
              <span style={{ color: "#1F883D" }}>+</span> <b>{c.company}</b> · {c.text}
            </Text>
          ))}

          <Text style={label}>READY FOR REVIEW</Text>
          <Text style={{ fontSize: 13, margin: 0 }}>{p.ready} verified opener{p.ready === 1 ? "" : "s"} ready for your review.</Text>

          {p.problems.length > 0 && (
            <>
              <Text style={label}>NEEDS ATTENTION</Text>
              {p.problems.map((x, i) => (
                <Text key={i} style={{ fontSize: 13, color: "#B7791F", margin: "3px 0" }}>{x}</Text>
              ))}
            </>
          )}
          <Section style={{ marginTop: 22 }}>
            <Link href={p.baseUrl} style={{ background: "#0F9F8E", color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 14, textDecoration: "none" }}>Open Scout</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
