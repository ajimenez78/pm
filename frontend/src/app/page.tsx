import {
  ChevronRight,
  Command,
  LayoutDashboard,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { Board } from "@/features/board/board";

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a aria-label="Northstar home" className="brand" href="#board">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">
            northstar<span>.</span>
          </span>
        </a>

        <div className="workspace-switcher">
          <span className="workspace-icon">
            <Sparkles aria-hidden="true" size={18} />
          </span>
          <span className="workspace-copy">
            <span className="sidebar-overline">WORKSPACE</span>
            <strong>Studio North</strong>
          </span>
        </div>

        <nav aria-label="Workspace navigation" className="sidebar-navigation">
          <span className="sidebar-overline">YOUR SPACE</span>
          <a aria-current="page" className="nav-link" href="#board">
            <LayoutDashboard aria-hidden="true" size={18} />
            <span>Project board</span>
            <span aria-hidden="true" className="nav-active-mark" />
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <Lightbulb aria-hidden="true" size={17} />
            </span>
            <div>
              <strong>Small steps add up.</strong>
              <p>Keep the important work moving.</p>
            </div>
          </div>
          <div className="sidebar-footnote">
            <span className="sidebar-footnote-mark">
              <Command aria-hidden="true" size={13} />
            </span>
            MADE FOR MOMENTUM
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div aria-label="Breadcrumb" className="breadcrumbs">
            <span>Studio North</span>
            <ChevronRight aria-hidden="true" size={15} />
            <strong>Project board</strong>
          </div>
          <span className="topbar-caption">
            A clearer view of what matters
          </span>
        </header>

        <div className="page-content">
          <section aria-labelledby="welcome-title" className="welcome">
            <p className="welcome-eyebrow">
              <span />
              A GOOD DAY TO MAKE PROGRESS
            </p>
            <h1 id="welcome-title">
              Make good ideas
              <br />
              <span>happen.</span>
            </h1>
            <p className="welcome-description">
              Bring the next big thing to life, one thoughtful step at a time.
            </p>
          </section>

          <div className="board-anchor" id="board">
            <Board />
          </div>

          <footer className="page-footer">
            <span>Progress over perfect.</span>
            <span className="footer-divider" />
            <span>Keep going.</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
