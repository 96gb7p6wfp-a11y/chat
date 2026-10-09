import React, { useEffect, useId, useRef } from 'react';
import { X, ArrowRight } from 'lucide-react';

export function Button({ variant = 'primary', icon: Icon, children, className = '', type = 'button', ...props }) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={17} aria-hidden="true"/>}{children}</button>;
}

export function Field({ label, help, error, children, className = '' }) {
  const generatedId = useId();
  const id = React.isValidElement(children) ? children.props.id || generatedId : generatedId;
  const descriptions = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ');
  const control = React.isValidElement(children) ? React.cloneElement(children, { id, 'aria-describedby': [children.props['aria-describedby'], descriptions].filter(Boolean).join(' ') || undefined }) : children;
  return <div className={`field ${className}`}><label className="field-label" htmlFor={id}>{label}</label>{control}{help && <span id={`${id}-help`} className="field-help">{help}</span>}{error && <span id={`${id}-error`} className="field-error" role="alert">{error}</span>}</div>;
}

export function Modal({ title, onClose, children, wide = false, className = '' }) {
  const titleId = useId();
  const ref = useRef(null);
  const backdropRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const resize = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height || window.innerHeight;
      if (backdropRef.current) {
        backdropRef.current.style.setProperty('--modal-viewport-height', `${height}px`);
        backdropRef.current.style.height = `${height}px`;
        backdropRef.current.style.top = `${viewport?.offsetTop || 0}px`;
        backdropRef.current.style.bottom = 'auto';
      }
      if (ref.current?.contains(document.activeElement)) document.activeElement?.scrollIntoView?.({ block: 'nearest' });
    };
    resize();
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    const listener = (event) => {
      if (event.key === 'Escape') closeRef.current?.();
      if (event.key !== 'Tab') return;
      const nodes = [...(ref.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]') || [])].filter(node => node.getClientRects().length);
      if (!nodes.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === ref.current)) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', listener);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', listener); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); window.removeEventListener('resize', resize); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" ref={backdropRef} onClick={event => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className={`modal ${wide ? 'modal-wide' : ''} ${className}`} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="modal-header"><h2 id={titleId}>{title}</h2>{onClose && <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={21}/></button>}</header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

export function Segmented({ options, value, onChange, label = 'View', className = '' }) {
  return <div className={`segmented ${className}`} role="group" aria-label={label}>{options.map(option => {
    const item = typeof option === 'string' ? { value: option, label: option } : { ...option, value: option.value ?? option.id };
    return <button key={item.value} type="button" aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>;
  })}</div>;
}

export function SectionHeading({ title, subtitle, action, children }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>{action || children}</div>;
}

export function EmptyState({ icon: Icon, title, description, action, children }) {
  return <div className="empty-state">{Icon && <Icon size={28} strokeWidth={1.5}/>}<h3>{title}</h3>{description && <p>{description}</p>}{action}{children}</div>;
}

export function formatDate(dateKey, options = { day: 'numeric', month: 'short' }) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return 'No date set';
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(`${dateKey}T12:00:00`));
}

export function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
}

export function LinkButton({ children, onClick }) {
  return <button className="text-button" type="button" onClick={onClick}>{children}<ArrowRight size={15}/></button>;
}
