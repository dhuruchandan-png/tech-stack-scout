import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

type Props = {
  company: string; subject: string; body: string; opener: string; summary: string;
  evidence: { ref: string; title: string; url: string }[]; reviewUrl: string; intendedFor: string | null;
};

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const serif = "Georgia, 'Times New Roman', serif";

export default function InternalDraftEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>{`Internal draft for ${p.company}: not sent to the prospect`}</Preview>
      <Body style={{ background: "#F7F8FA", fontFamily: "Helvetica, Arial, sans-serif", color: "#0E1621", margin: 0, padding: "24px 0" }}>
        <Container style={{ background: "#FFFFFF", border: "1px solid #E3E8EE", borderRadius: 10, padding: 28, maxWidth: 600 }}>
          <Text style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", color: "#CF3A3F", margin: 0 }}>
            INTERNAL DRAFT · NOT SENT TO THE PROSPECT
          </Text>
          {p.intendedFor && <Text style={{ fontSize: 12, color: "#5A6B7D" }}>Test mode: intended for {p.intendedFor}</Text>}
          <Heading style={{ fontFamily: serif, fontSize: 26, margin: "12px 0 4px" }}>{p.company}</Heading>
          <Text style={{ fontSize: 13, color: "#5A6B7D", margin: 0 }}>Subject: {p.subject}</Text>

          <Section style={{ borderLeft: "3px solid #6D5BEA", paddingLeft: 14, margin: "18px 0" }}>
            <Text style={{ fontFamily: serif, fontSize: 18, lineHeight: "26px", margin: 0 }}>{p.opener}</Text>
          </Section>

          <Text style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", color: "#5A6B7D" }}>EMAIL DRAFT</Text>
          <Text style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: "22px", background: "#F1F4F7", borderRadius: 8, padding: 14 }}>{p.body}</Text>

          <Text style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", color: "#5A6B7D" }}>ENGINEERING CONTEXT</Text>
          <Text style={{ fontFamily: serif, fontSize: 15, lineHeight: "23px" }}>{p.summary}</Text>

          {p.evidence.length > 0 && (
            <>
              <Text style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", color: "#5A6B7D" }}>EVIDENCE</Text>
              {p.evidence.map((e) => (
                <Text key={e.ref} style={{ fontSize: 13, margin: "2px 0" }}>
                  <span style={{ fontFamily: mono, color: "#0F9F8E" }}>[{e.ref}]</span> <Link href={e.url}>{e.title}</Link>
                </Text>
              ))}
            </>
          )}

          <Section style={{ marginTop: 22 }}>
            <Link href={p.reviewUrl} style={{ background: "#D9631E", color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 14, textDecoration: "none" }}>
              Review in Scout
            </Link>
          </Section>
          <Text style={{ fontSize: 11, color: "#5A6B7D", marginTop: 22 }}>
            Tech Stack Scout never sends to prospects. You send from your own inbox.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
