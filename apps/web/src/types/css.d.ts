// Ambient declaration for stylesheet side-effect imports (`import './globals.css'`).
//
// WHY THIS FILE EXISTS. `layout.tsx` and `global-error.tsx` both import
// globals.css purely for its side effect — the bundler turns that import into a
// <link>, and nothing in the module's namespace is ever read. TypeScript has no
// idea what a .css file is, so with side-effect imports checked it reports
// TS2882 ("Cannot find module or type declarations for side-effect import") and
// typecheck exits 1.
//
// Worth being clear that this is a PRE-EXISTING hole, not one the observability
// work opened: layout.tsx has carried the same error since the stylesheet was
// first imported. global-error.tsx merely became the second file to trip it.
//
// THE FIX IS A DECLARATION, NOT A FLAG. The obvious alternative — switching the
// side-effect-import check off — would buy a green typecheck by blinding the
// compiler to every mistyped side-effect import in the app, and those are real:
// the check is what catches `import '@/lib/env'` surviving a file rename, or a
// polyfill import pointing at a package that was never installed. Both fail
// silently at runtime and only in the environment that needed them. Losing that
// to paper over a missing .css declaration is a bad trade; declaring the thing
// the compiler is honestly asking about is the actual fix.
//
// Kept to a bare `declare module` with no exported members ON PURPOSE. This app
// imports stylesheets only for their side effect, never for a CSS-modules-style
// binding (`import styles from './x.module.css'`) — styling is Tailwind classes
// and design tokens throughout. Declaring an `any`-shaped default export would
// invent a value that no stylesheet here actually provides and would type every
// class-name lookup as `any` if someone did start using CSS modules, which is a
// worse place to land than a fresh compile error asking for a real declaration.
declare module '*.css'
