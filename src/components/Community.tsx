/* Forum, community chat and support pages, opened from the small links under the header buttons.
   The forum and chat need a server and accounts, so for now they say what is coming. */
import { SecHead } from './ui';

const ISSUES = 'https://github.com/rameezkhair/novac-heatload/issues';
export const SUPPORT = 'support@novac.ae';

function Soon({ title, heading, text }: { title: string; heading: string; text: string }) {
  return <section>
    <SecHead title={title} />
    <div className="lib-soon">
      <span className="tag">Coming soon</span>
      <h3>{heading}</h3>
      <p>{text}</p>
    </div>
  </section>;
}

export const Forum = () => <Soon title="Forum" heading="Ask and answer HVAC design questions"
  text="A place for UAE engineers to discuss load calculations, design conditions and code requirements, and to share worked examples. The forum is coming soon." />;

export const CommunityChat = () => <Soon title="Community chat" heading="Talk to other engineers in real time"
  text="Live chat threads by topic, from design conditions to plant selection, for quick questions that do not need a full forum post. Community chat is coming soon." />;

export function Support({ onLibrary }: { onLibrary: () => void }) {
  return <section>
    <SecHead title="Support" sub="Help with NOVAC and your calculations" />
    <div className="support">
      <article>
        <h3>Email support</h3>
        <p>Tell us what happened, the step you were on and, if you can, attach your project file (Projects, then Save). We reply at <b>support@novac.ae</b>.</p>
        <a className="btn primary" href={`mailto:${SUPPORT}?subject=${encodeURIComponent('NOVAC support')}`}>Email {SUPPORT}</a>
        <a className="support-alt" href={ISSUES} target="_blank" rel="noopener noreferrer">Or report it on GitHub</a>
      </article>
      <article>
        <h3>How NOVAC calculates</h3>
        <p>Methods, UAE authority regulations and ASHRAE standards behind every value, each downloadable as a PDF.</p>
        <button className="btn" type="button" onClick={onLibrary}>Open the Library</button>
      </article>
      <article>
        <h3>Common questions</h3>
        <p>Pricing, calculation method, supported codes and where your projects are stored.</p>
        <a className="btn" href="./#faq">Read the FAQ</a>
      </article>
    </div>
  </section>;
}
