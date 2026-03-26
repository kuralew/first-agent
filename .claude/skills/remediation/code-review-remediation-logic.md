
## Naming Convention Violation

### Component Not in PascalCase
- Identify the component name in the file
- Rename the component declaration to PascalCase (e.g. `myComponent` → `MyComponent`)
- Update all import references to this component across the codebase
- Update the filename to match the new component name (e.g. `myComponent.tsx` → `MyComponent.tsx`)

### Missing Container Suffix for API-calling Components
- Identify that the component makes an API call by checking if it uses fetch, axios, useQuery.
- If uncertain whether a component makes an API call (e.g. it uses a custom hook whose internals are not visible), flag it for developer review rather than auto-renaming
- Rename the component by appending `Container` to the name (e.g. `UserProfile` → `UserProfileContainer`) and update the file name to `UserProfileContainer` in the same folder where the component is located.
- Update all import references accordingly

## Business Logic Separation Violation
### Business Logic Inside Presentation Component
- If you find a business logic inside a component, create a new helper file matching the component and move the business logic to that helper component and reference it inside the component. If the component is `UserProfile.tsx`, create a helper `UserProfileHelper.tsx` in the same folder where the component is located
- Make sure a component should be just a presentation component. Move data transformation logic, API calls to helper file. JSX renderings and UI state like isOpen, isLoading should stay. 
- If the logic involves React state or lifecycle (useState, useEffect), extract it into a custom hook named `use[ComponentName].ts` in the same folder
- If the logic is a pure function with no React dependencies, extract it into `[ComponentName].utils.ts`.
- After extracting logic, import the helper file or custom hook back into the presentation component and replace the inline logic with the imported reference

## Body Color Violation
- Identify if the body or root text element has a color assigned
- If color is missing or incorrect, set it to #000042
- Apply to the correct selector — check whether the project uses a global CSS file, Tailwind config, or inline styles and apply the fix in the appropriate place

## Hyperlinks Display Violation
- Identify Hyperlinks in a body of div, span, p, CTA (Call To Action) links such as sub header or View More links etc.
- If Hyperlink is in a body, it should be in #000042 and underlined. Otherwise, if it's a CTA Link, should be decorated when hover and color changed to #0018F2. Use inline styles for now to fix.

## Distinguishing Body Links from CTA Links

To determine link type, check two things:

**1. Link text pattern:**
- If the link text is action-oriented and imperative (View More, Compare, 
  Download, Get Started, Learn More) → CTA link
- If the link text is descriptive or embedded in content → body link
- When context and text pattern conflict, text pattern takes priority
- Any link with imperative action text (View, Compare, Download, Select, 
  Add, Create) is always a CTA link regardless of where it sits

**2. Context:**
- If the link sits inside a paragraph, sentence, or block of text → body link
- If the link stands alone as a UI element → CTA link

**Body link treatment:**
- Color: #000042
- Always underlined (static, not on hover)

**CTA link treatment:**
- Default color: #000042, no underline
- On hover: color changes to #0018F2, underline appears

## Unit Test Coverage Violation
- If any component lacked a unit test, add a test coverage
 - [componentName].test.tsx
 - Use React Testing Library and vitest library for writing tests
 - Import test utilities as: `import { describe, it, expect, vi } from 'vitest'`
 - Import rendering utilities as: `import { render, screen, fireEvent } from '@testing-library/react'`
 - Use `@testing-library/jest-dom` matchers where appropriate (e.g. `toBeInTheDocument()`, `toHaveTextContent()`)
 - For simple function mocks use vi.fn()
 - For module-level API client mocks use vi.mock()
 - Each test file must cover the following at minimum:
  
  - Check if a component renders without crashing
  - For any dom element in the component
   - Test click event if it's a button
   - Test text input if it's an input element
   - If it's a presentation component, pass appropriate props and check if contents are displayed

## Performance
- Wrap expensive calculations in useMemo when they depend on state or props