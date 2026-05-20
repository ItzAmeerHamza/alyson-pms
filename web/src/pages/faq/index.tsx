import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";

const FAQ_ITEMS: { id: string; question: string; answer: ReactNode }[] = [
  {
    id: "time-tracking",
    question: "How does the app track my time?",
    answer: (
      <p className="text-muted-foreground leading-relaxed">
        When you start the timer in the desktop app, Alyson PM records your active work session. Time is attributed to
        the session while tracking is running, together with optional signals your organization enables (such as idle
        detection, apps in the foreground, and URLs where supported). Stopping the timer or logging out ends the
        session for billing and reporting.
      </p>
    ),
  },
  {
    id: "screenshots",
    question: "How do screenshots work?",
    answer: (
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        <p>
          If your organization enables screenshots, the desktop agent can capture still images of your displays on a
          schedule while you are clocked in. Images are uploaded for review in the web portal according to your
          company&apos;s policies.
        </p>
        <p>
          Screenshots are visual snapshots only; they are not a continuous screen recording unless your organization
          explicitly uses separate features described in your internal policy.
        </p>
      </div>
    ),
  },
  {
    id: "screenshot-interval",
    question: "What is screenshot duration / how often are screenshots taken?",
    answer: (
      <p className="text-muted-foreground leading-relaxed">
        The time between screenshots is set by your organization in the web admin (often on the order of one to
        several minutes). The desktop app follows that schedule while tracking is active. If you need the exact value
        for your account, ask your administrator or check any interval shown in your desktop or org settings.
      </p>
    ),
  },
  {
    id: "audio",
    question: "Does the app record audio or microphone?",
    answer: (
      <p className="text-muted-foreground leading-relaxed">
        No. Alyson PM is built for time tracking, screenshots where enabled, and activity metadata (such as app and URL
        signals your org turns on). It does not record microphone input, system audio, or phone calls for time
        tracking.
      </p>
    ),
  },
  {
    id: "permissions",
    question: "What permissions or access does the desktop app need?",
    answer: (
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        <p>Depending on your platform and what your organization enables, the agent may ask for:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-foreground">Screen recording / screen capture</strong> — to take screenshots when
            that feature is on.
          </li>
          <li>
            <strong className="text-foreground">Accessibility</strong> (macOS) — often used to read the focused window
            and support input or app-title related features your org enables.
          </li>
          <li>
            <strong className="text-foreground">Automation or related prompts</strong> — in some setups, optional
            helpers (for example precise browser URL capture) may request additional consent.
          </li>
          <li>
            <strong className="text-foreground">Windows</strong> — you may see prompts for screen capture or elevated
            access depending on build and policy; follow your IT instructions.
          </li>
        </ul>
        <p>You only need to grant what the installer or OS prompts for, and only if your role requires running the agent.</p>
      </div>
    ),
  },
  {
    id: "how-grant",
    question: "How do I grant those permissions?",
    answer: (
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        <p>
          <strong className="text-foreground">macOS:</strong> Open <em>System Settings → Privacy &amp; Security</em> and
          select <em>Screen Recording</em> and <em>Accessibility</em>. Enable Alyson PM (or &quot;Work Time&quot; /
          your deployed app name). You may need to quit and reopen the app for changes to apply.
        </p>
        <p>
          <strong className="text-foreground">Windows:</strong> Use <em>Settings → Privacy → App permissions</em> as
          directed by the installer, or your IT guide, to allow screen capture if prompted.
        </p>
        <p>
          The desktop app may also surface shortcuts to the right settings pane—use those if you see them after login.
        </p>
      </div>
    ),
  },
  {
    id: "ai-analysis",
    question: "What is AI analysis?",
    answer: (
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        <p>
          In the web portal, administrators can use AI-assisted features (for example under <em>AI Insights</em> or
          related reporting) to summarize patterns from already-collected activity and screenshots according to your
          organization&apos;s configuration.
        </p>
        <p>
          It is an analytical layer on top of existing data—not a separate invisible recorder. Exact models and
          retention follow your org&apos;s settings and contracts; ask your admin if you need the official policy text.
        </p>
      </div>
    ),
  },
  {
    id: "mac-open-unnotarized",
    question: "macOS blocked Alyson PM (not from an identified developer) — how do I open it?",
    answer: (
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        <p>
          The desktop app may not be Apple-notarized yet. If macOS stops you from opening it, you can allow it manually.
          Use <strong className="text-foreground">Option 1</strong> below (wording matches Apple&apos;s older
          &quot;Security &amp; Privacy&quot; flow; on <strong className="text-foreground">macOS Ventura or later</strong>,
          open <em>System Settings</em> instead of System Preferences, then go to <em>Privacy &amp; Security</em> and look
          for <em>Open Anyway</em> after you have tried to launch the app once).
        </p>
        <p className="font-semibold text-foreground">Option 1: Allow the app manually in System Preferences</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Click Done on the warning message.</li>
          <li>Open System Preferences.</li>
          <li>Go to Security &amp; Privacy.</li>
          <li>
            In the General tab, you should see a message saying &quot;Alyson PM was blocked from use because it is not
            from an identified developer&quot; with an option to Open Anyway.
          </li>
          <li>Click Open Anyway, then enter your password if prompted.</li>
        </ol>
      </div>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="container py-6 max-w-3xl">
      <PageHeader
        title="Frequently asked questions"
        subtitle="Time tracking, screenshots, permissions, AI features, and opening the Mac desktop app when Gatekeeper blocks it."
      />
      <Card>
        <CardContent className="pt-6">
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
