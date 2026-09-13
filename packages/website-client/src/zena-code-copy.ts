import {BehaviorElement} from './light-element.js';

/**
 * Copy-to-clipboard for code blocks.
 *
 * One instance sits in the layout and delegates clicks for every
 * `button.copy` the markdown renderer emitted, so adding a code block never
 * means adding an element.
 */
export class ZenaCodeCopy extends BehaviorElement {
  connectedCallback(): void {
    this.addEventListener(
      'click',
      async (e) => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
          'button.copy',
        );
        if (!button) return;

        const code = button.parentElement?.querySelector('code');
        if (!code) return;

        let text = '';
        if (code.querySelector('.code-diagnostic')) {
          const clone = code.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll('.code-diagnostic')
            .forEach((el) => el.remove());
          text = clone.textContent ?? '';
        } else {
          text = code.textContent ?? '';
        }

        try {
          await navigator.clipboard.writeText(text);
        } catch {
          return;
        }

        button.classList.add('copied');
        clearTimeout(Number(button.dataset['timer']));
        button.dataset['timer'] = String(
          setTimeout(() => button.classList.remove('copied'), 2000),
        );
      },
      {signal: this.disconnectedSignal},
    );
  }
}

customElements.define('zena-code-copy', ZenaCodeCopy);

declare global {
  interface HTMLElementTagNameMap {
    'zena-code-copy': ZenaCodeCopy;
  }
}
