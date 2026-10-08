"use client";

import { useEffect, useId, useRef, useState, type ElementType } from "react";
import { Menu, X } from "lucide-react";

interface MobileNavigationProps {
  sections: readonly { id: string; label: string; icon: ElementType }[];
  activeId: string;
  onNavigate: (id: string) => void;
}

export default function MobileNavigation({ sections, activeId, onNavigate }: MobileNavigationProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  const titleId = `${id}-title`;

  function restoreScrolling() {
    if (previousOverflow.current === null) return;
    document.body.style.overflow = previousOverflow.current;
    previousOverflow.current = null;
  }

  function finishClose() {
    // Ignore a queued close event if the user has already reopened the drawer.
    if (dialogRef.current?.open) return;
    restoreScrolling();
    setIsOpen(false);
    if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
  }

  function openMenu() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open || window.matchMedia("(min-width: 801px)").matches) return;
    dialog.showModal();
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setIsOpen(true);
  }

  function closeMenu() {
    if (!dialogRef.current?.open) return;
    dialogRef.current.close();
    finishClose();
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 801px)");
    const dialog = dialogRef.current;
    const handleResize = () => {
      if (desktop.matches && dialog?.open) dialog.close();
    };
    desktop.addEventListener("change", handleResize);
    return () => {
      desktop.removeEventListener("change", handleResize);
      if (dialog?.open) dialog.close();
      if (previousOverflow.current !== null) {
        document.body.style.overflow = previousOverflow.current;
        previousOverflow.current = null;
      }
    };
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="mobile-menu-button icon-button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={openMenu}
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        id={id}
        className="mobile-navigation"
        aria-labelledby={titleId}
        onClose={finishClose}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMenu();
        }}
      >
        <div className="mobile-navigation-header">
          <div>
            <h2 id={titleId} className="mobile-navigation-heading">Signal Analyzer</h2>
            <p className="mobile-navigation-description">Choose a workspace view.</p>
          </div>
          <button type="button" className="mobile-navigation-close icon-button" aria-label="Close navigation" onClick={closeMenu} autoFocus>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="mobile-navigation-list" aria-label="Workspace navigation">
          {sections.map(({ id: sectionId, label, icon: Icon }) => (
            <button
              key={sectionId}
              type="button"
              className={`mobile-navigation-item${sectionId === activeId ? " is-active" : ""}`}
              aria-current={sectionId === activeId ? "page" : undefined}
              onClick={() => {
                closeMenu();
                onNavigate(sectionId);
              }}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </dialog>
    </>
  );
}
