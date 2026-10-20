import { act, renderHook } from '@testing-library/react-native';
import { useAboutValidation } from './components/AboutYouForm';
import { emptyDraft, type TargetsDraft } from './draft';

const draft = (over: Partial<TargetsDraft> = {}): TargetsDraft => ({
  ...emptyDraft('metric', 0),
  sex: 'female',
  birthYear: '',
  heightCm: '165',
  weight: '65',
  ...over,
});

describe('useAboutValidation (D2: validate on CONTINUE, then on blur; focus the first invalid field)', () => {
  it('shows nothing until the first attempt', async () => {
    const { result } = await renderHook(() => useAboutValidation(draft()));
    expect(result.current.errors).toEqual({});
    expect(result.current.focus).toBeNull();
  });

  it('asks to focus the first invalid field on submit, and shows every error', async () => {
    const { result } = await renderHook(() => useAboutValidation(draft({ weight: '' })));
    await act(async () => void result.current.submit());
    expect(result.current.focus).toMatchObject({ field: 'birthYear' });
    expect(Object.keys(result.current.errors).sort()).toEqual(['birthYear', 'weight']);
  });

  it('moves the focus request on a second attempt', async () => {
    const { result } = await renderHook(() => useAboutValidation(draft()));
    await act(async () => void result.current.submit());
    const first = result.current.focus?.n;
    await act(async () => void result.current.submit());
    expect(result.current.focus?.n).toBe((first ?? 0) + 1);
  });

  it('refreshes on blur only after an attempt, not on every keystroke', async () => {
    let current = draft();
    const { result, rerender } = await renderHook(() => useAboutValidation(current));
    await act(async () => result.current.onBlur());
    expect(result.current.errors).toEqual({}); // no attempt yet
    await act(async () => void result.current.submit());
    expect(result.current.errors.birthYear).toBeDefined();
    current = draft({ birthYear: '1996' });
    await rerender({});
    expect(result.current.errors.birthYear).toBeDefined(); // typing alone doesn't clear it
    await act(async () => result.current.onBlur());
    expect(result.current.errors).toEqual({});
  });

  it('does not ask to focus a field for an under-16 year, and shows no field error', async () => {
    const { result } = await renderHook(() => useAboutValidation(draft({ birthYear: '2015' })));
    let outcome;
    await act(async () => {
      outcome = result.current.submit();
    });
    expect(outcome).toMatchObject({ ok: false, underage: true });
    expect(result.current.focus).toBeNull();
    expect(result.current.errors).toEqual({});
  });

  it('can show a specific error, such as the under-16 message in a sheet', async () => {
    const { result } = await renderHook(() => useAboutValidation(draft({ birthYear: '2015' })));
    await act(async () => result.current.showErrors({ birthYear: 'You need to be 16' }));
    expect(result.current.errors).toEqual({ birthYear: 'You need to be 16' });
  });
});
