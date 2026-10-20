/**
 * Spec 001 QA bug 2 (WCAG 4.1.2): react-native-web 0.21 drops `accessibilityState.checked`, so radios must also
 * pass `aria-checked`. Jest renders the native Pressable (which folds `aria-checked` into accessibilityState), so
 * this file renders the same components with react-native-web to static HTML and reads the real DOM attributes.
 */
import type { ReactElement } from 'react';

function renderOnWeb(
  build: (ui: {
    Choice: typeof import('./Choice').Choice;
    RadioCard: typeof import('./RadioCard').RadioCard;
  }) => ReactElement,
): string {
  let html = '';
  jest.isolateModules(() => {
    jest.doMock('@/lib/haptics', () => ({ haptics: { selection: () => undefined } }));
    jest.doMock('react-native', () => jest.requireActual('react-native-web'));
    const { renderToStaticMarkup } =
      jest.requireActual<typeof import('react-dom/server')>('react-dom/server');
    const ui = {
      Choice: jest.requireActual<typeof import('./Choice')>('./Choice').Choice,
      RadioCard: jest.requireActual<typeof import('./RadioCard')>('./RadioCard').RadioCard,
    };
    html = renderToStaticMarkup(build(ui));
  });
  return html;
}

describe('web radio state', () => {
  it('Choice chips expose role=radio with aria-checked true / false', () => {
    const html = renderOnWeb(({ Choice }) => (
      <Choice
        label="Units"
        value="metric"
        options={[
          { value: 'metric', label: 'Metric' },
          { value: 'imperial', label: 'Imperial' },
        ]}
        onChange={() => undefined}
      />
    ));
    expect(html).toMatch(/role="radiogroup"/);
    expect(html).toMatch(
      /aria-checked="true"[^>]*aria-label="Metric"|aria-label="Metric"[^>]*aria-checked="true"/,
    );
    expect(html).toMatch(
      /aria-checked="false"[^>]*aria-label="Imperial"|aria-label="Imperial"[^>]*aria-checked="false"/,
    );
  });

  it('RadioCards expose aria-checked, selected and not', () => {
    const html = renderOnWeb(({ RadioCard }) => (
      <>
        <RadioCard title="LOSE FAT" description="d" selected onPress={() => undefined} />
        <RadioCard
          title="BUILD MUSCLE"
          description="d"
          selected={false}
          onPress={() => undefined}
        />
      </>
    ));
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(1);
  });
});
