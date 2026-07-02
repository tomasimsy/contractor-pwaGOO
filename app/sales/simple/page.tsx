"use client";
import { Search, Copy, Check, ChevronDown, ChevronUp, Star, Bookmark, Share2, Filter, X, BookOpen } from "lucide-react";


export default function SalesPlaybook() {
  return (
    <>
      <style>{`
        :root{--bg:#f4f6f8;--card:#fff;--text:#24313f;--accent:#0f766e;--muted:#667085}
        *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:var(--text)}
        header{background:linear-gradient(135deg,#0f766e,#115e59);color:#fff;padding:32px 20px;text-align:center}
        .container{max-width:1100px;margin:auto;padding:20px}
        nav{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px;overflow:auto;white-space:nowrap}
        nav a{margin-right:14px;color:var(--accent);text-decoration:none;font-weight:bold}
        details{background:var(--card);border-radius:12px;padding:16px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.08)}
        summary{font-size:1.15rem;font-weight:bold;cursor:pointer}
        h3{color:var(--accent);margin-bottom:6px}
        ul{padding-left:20px}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
        .card{background:#fff;padding:18px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
        blockquote{border-left:4px solid var(--accent);padding-left:12px;color:#333}
        footer{text-align:center;color:var(--muted);padding:30px}
        @media(max-width:700px){header h1{font-size:1.7rem}}
      `}</style>

      <header>
        <h1>Remodeling Sales Objection Playbook</h1>
        <p>Professional, empathetic responses to help homeowners make informed decisions.</p>
         <BookOpen size={16} /> <a href="/sales" className="text-white hover:text-emerald-200 p-4 bg-emerald-500">View Rich Version</a>

      </header>

      <nav>
        <a href="#obj">Objections</a>
        <a href="#stories">Stories</a>
        <a href="#discover">Discovery</a>
        <a href="#value">Value</a>
        <a href="#close">Closing</a>
      </nav>

      <div className="container">
        <section id="obj">
          <details>
            <summary>1. Your price is too high.</summary>
            <h3>What they're really concerned about</h3>
            <p>They're unsure the value justifies the investment.</p>
            <h3>Questions to Ask</h3>
            <p>Can you share what's driving that concern? Are you comparing another proposal?</p>
            <h3>Suggested Response</h3>
            <blockquote>I completely understand. Rather than being the cheapest, we focus on quality workmanship, communication, durable materials, and minimizing surprises. Let's compare the proposals line by line.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Detailed scope, warranties, photos, reviews.</p>
            <h3>Respectful Next Step</h3>
            <p>Review proposals together.</p>
          </details>

          <details>
            <summary>2. We're getting more quotes.</summary>
            <h3>What they're really concerned about</h3>
            <p>They want confidence.</p>
            <h3>Questions to Ask</h3>
            <p>How will you compare companies?</p>
            <h3>Suggested Response</h3>
            <blockquote>I encourage getting multiple quotes. Just compare scope, materials, warranty and communication—not only price.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Explain scope differences.</p>
            <h3>Respectful Next Step</h3>
            <p>Offer to review competitors' proposals.</p>
          </details>

          <details>
            <summary>3. We need to think about it.</summary>
            <h3>What they're really concerned about</h3>
            <p>They still have unanswered questions.</p>
            <h3>Questions to Ask</h3>
            <p>What would you like to think through?</p>
            <h3>Suggested Response</h3>
            <blockquote>Take your time. I'd rather answer every question than have you guessing.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>References and examples.</p>
            <h3>Respectful Next Step</h3>
            <p>Schedule follow-up.</p>
          </details>

          <details>
            <summary>4. Maybe next year.</summary>
            <h3>What they're really concerned about</h3>
            <p>Timing or budget.</p>
            <h3>Questions to Ask</h3>
            <p>What makes next year a better fit?</p>
            <h3>Suggested Response</h3>
            <blockquote>Waiting can make sense, but delaying existing damage may increase costs.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Examples of worsening damage.</p>
            <h3>Respectful Next Step</h3>
            <p>Offer planning visit.</p>
          </details>

          <details>
            <summary>5. We're not ready.</summary>
            <h3>What they're really concerned about</h3>
            <p>Need confidence.</p>
            <h3>Questions to Ask</h3>
            <p>What would help you feel ready?</p>
            <h3>Suggested Response</h3>
            <blockquote>No pressure—I'm here to educate.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Educational resources.</p>
            <h3>Respectful Next Step</h3>
            <p>Stay in touch.</p>
          </details>

          <details>
            <summary>6. I need to talk to my spouse.</summary>
            <h3>What they're really concerned about</h3>
            <p>Need shared decision.</p>
            <h3>Questions to Ask</h3>
            <p>Would it help to meet together?</p>
            <h3>Suggested Response</h3>
            <blockquote>I'd be happy to answer both of your questions together.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Joint consultation.</p>
            <h3>Respectful Next Step</h3>
            <p>Schedule meeting.</p>
          </details>

          <details>
            <summary>7. Can you lower the price?</summary>
            <h3>What they're really concerned about</h3>
            <p>Seeking value.</p>
            <h3>Questions to Ask</h3>
            <p>Do you have a target budget?</p>
            <h3>Suggested Response</h3>
            <blockquote>Instead of lowering quality, let's discuss scope options.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Phased work.</p>
            <h3>Respectful Next Step</h3>
            <p>Revise scope.</p>
          </details>

          <details>
            <summary>8. Why should we choose your company?</summary>
            <h3>What they're really concerned about</h3>
            <p>Reducing risk.</p>
            <h3>Questions to Ask</h3>
            <p>What's most important in a contractor?</p>
            <h3>Suggested Response</h3>
            <blockquote>We prioritize communication, craftsmanship and transparency.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Reviews, portfolio, warranty.</p>
            <h3>Respectful Next Step</h3>
            <p>Show similar projects.</p>
          </details>

          <details>
            <summary>9. How long will the project take?</summary>
            <h3>What they're really concerned about</h3>
            <p>Planning.</p>
            <h3>Questions to Ask</h3>
            <p>Do you have a deadline?</p>
            <h3>Suggested Response</h3>
            <blockquote>We'll provide a realistic schedule and keep you informed.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Timeline.</p>
            <h3>Respectful Next Step</h3>
            <p>Review milestones.</p>
          </details>

          <details>
            <summary>10. I'm worried about disruption.</summary>
            <h3>What they're really concerned about</h3>
            <p>Daily life.</p>
            <h3>Questions to Ask</h3>
            <p>What concerns you most?</p>
            <h3>Suggested Response</h3>
            <blockquote>We protect your home and clean up daily.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Dust protection.</p>
            <h3>Respectful Next Step</h3>
            <p>Explain workflow.</p>
          </details>

          <details>
            <summary>11. What if something goes wrong?</summary>
            <h3>What they're really concerned about</h3>
            <p>Risk.</p>
            <h3>Questions to Ask</h3>
            <p>What worries you most?</p>
            <h3>Suggested Response</h3>
            <blockquote>We communicate quickly and resolve issues professionally.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Warranty.</p>
            <h3>Respectful Next Step</h3>
            <p>Review process.</p>
          </details>

          <details>
            <summary>12. How do I know the work will be high quality?</summary>
            <h3>What they're really concerned about</h3>
            <p>Need proof.</p>
            <h3>Questions to Ask</h3>
            <p>What does quality mean to you?</p>
            <h3>Suggested Response</h3>
            <blockquote>We'll show similar projects and references.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Portfolio.</p>
            <h3>Respectful Next Step</h3>
            <p>Share references.</p>
          </details>

          <details>
            <summary>13. We've had a bad contractor before.</summary>
            <h3>What they're really concerned about</h3>
            <p>Trust.</p>
            <h3>Questions to Ask</h3>
            <p>What happened?</p>
            <h3>Suggested Response</h3>
            <blockquote>I'm sorry. We'll explain our communication process so there are no surprises.</blockquote>
            <h3>Supporting Evidence</h3>
            <p>Project management.</p>
            <h3>Respectful Next Step</h3>
            <p>Walk through process.</p>
          </details>
        </section>

        <section id="stories">
          <h2>Trust-Building Stories</h2>
          <div className="grid">
            <div className="card">A homeowner chose us because our proposal clearly explained every step and eliminated surprises.</div>
            <div className="card">We found hidden water damage, documented it with photos, explained options, and fixed it correctly before continuing.</div>
            <div className="card">Despite material delays, proactive communication kept the project on schedule.</div>
            <div className="card">A client who had a poor contractor experience appreciated our detailed timeline and regular updates.</div>
            <div className="card">We honored a warranty request promptly, reinforcing our commitment after project completion.</div>
          </div>
        </section>

        <section id="discover">
          <h2>Discovery Questions</h2>
          <div className="card">
            <ul>
              <li>What inspired this project?</li>
              <li>What problem would you most like this remodel to solve?</li>
              <li>What's most important when choosing a contractor?</li>
              <li>Have you remodeled before? What would you change?</li>
              <li>What does success look like?</li>
            </ul>
          </div>
        </section>

        <section id="value">
          <h2>Reinforcing Value</h2>
          <div className="card">
            <ul>
              <li>Explain long-term savings from quality workmanship.</li>
              <li>Highlight everything included in the proposal.</li>
              <li>Show similar completed projects.</li>
              <li>Walk through your communication process.</li>
              <li>Offer phased options instead of reducing quality.</li>
            </ul>
          </div>
        </section>

        <section id="close">
          <h2>Pressure-Free Closing Questions</h2>
          <div className="card">
            <ul>
              <li>How do you feel about the plan so far?</li>
              <li>What would help you feel more confident?</li>
              <li>Have we answered your biggest concerns?</li>
              <li>If everything meets your goals, when would you ideally like to begin?</li>
              <li>Would reviewing the proposal together be helpful?</li>
            </ul>
          </div>
        </section>

        <footer>Remodeling Sales Playbook</footer>
      </div>
    </>
  );
}