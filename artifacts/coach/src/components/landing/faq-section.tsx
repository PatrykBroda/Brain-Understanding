import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "What is FRAME?",
    a: "FRAME is an AI combat-sports coach that builds a structured, evidence-based model of you as an athlete. It observes how you move and think under pressure — through conversation, video analysis and daily check-ins — and coaches you with precision that is earned over time, not assumed."
  },
  {
    q: "Which combat sports does FRAME support?",
    a: "MMA, boxing, Muay Thai, kickboxing, Brazilian Jiu-Jitsu, wrestling, judo, karate and sambo. FRAME adapts its technical language and examples to your primary sport."
  },
  {
    q: "How does video analysis work?",
    a: "You upload training or sparring footage. Pose tracking runs on your own device, and every score in your FRAME REPORT is computed deterministically from measured movement — the AI writes only the narrative around those numbers, never the numbers themselves."
  },
  {
    q: "How much does FRAME cost?",
    a: "FRAME is free to start, including coaching conversations and a video analysis taster. FRAME+ is £6.99 per month and unlocks full video analysis history, the weekly mission, opponent scouting and the complete athlete model."
  },
  {
    q: "Is FRAME a replacement for my coach?",
    a: "No. FRAME is a layer on top of real training — it helps you understand your own patterns under pressure, prepares you between sessions and makes the coaching you already receive land better."
  },
  {
    q: "Can I use FRAME on my phone?",
    a: "Yes. FRAME is built mobile-first and can be installed on your phone like a native app directly from the browser."
  }
];

export function FaqSection() {
  return (
    <section id="faq" className="py-32 px-6 bg-background relative border-t border-white/[0.02]">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-sans font-extralight text-3xl uppercase tracking-[0.2em] text-foreground/90 mb-16 text-center">
          Frequently Asked
        </h2>
        
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-white/[0.06] px-2">
              <AccordionTrigger className="font-sans text-left text-[15px] tracking-wide text-foreground/80 hover:text-primary transition-colors py-6 hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="font-sans font-light text-[15px] leading-relaxed text-foreground/60 pb-6 pr-8">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
