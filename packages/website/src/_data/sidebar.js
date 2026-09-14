import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The standard library's modules, as sidebar entries.
 *
 * Reads the same generated file `_data/api.js` does, which fails the
 * build when it is missing — so during a site build this fallback is
 * unreachable. It exists for `scripts/print-outline.js` and
 * `scripts/scaffold-docs.js`, which read the sidebar as a content plan
 * and have no reason to need an extraction first.
 */
const stdlibModules = () => {
  try {
    const docs = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '_generated', 'stdlib-api.json'),
        'utf8',
      ),
    );
    return docs.modules.map((module) => ({
      text: module.id,
      link: `/reference/stdlib/${module.name}/`,
      // Rendered by src/reference/stdlib/module.njk. Marked so the
      // scaffolder does not write a placeholder over the generated page.
      generated: true,
    }));
  } catch {
    return [];
  }
};

/**
 * Sidebar configuration, keyed by URL prefix.
 *
 * This doubles as the site's content plan: every leaf carries the `outline` of
 * sections the page is meant to cover, which `npm run scaffold -w
 * @zena-lang/website` turns into placeholder pages. Keep the outlines honest —
 * they are the spec for a page that isn't written yet.
 *
 * Group shape: `{text, collapsed?, items}`. A group renders collapsed unless it
 * contains the current page; `collapsed: false` pins it open.
 */

const guide = [
  {
    text: 'Introduction',
    items: [
      {
        text: 'What is Zena?',
        link: '/guide/what-is-zena/',
        outline: [
          'Built for Wasm GC',
          'How it compares',
          'What it looks like',
          'Where the project stands',
        ],
      },
      {
        text: 'Why Zena?',
        link: '/guide/why-zena/',
        outline: [
          'The Wasm GC gap',
          'Nothing in your module but your code',
          'Compilation fast enough to stay in the loop',
          'Correctness',
          'Familiar to humans and to agents',
          'Why WebAssembly at all',
          'No users is a superpower',
          'Where Zena fits',
        ],
      },
      {
        text: 'Language Overview',
        link: '/guide/overview/',
        outline: [
          'Variables',
          'Functions',
          'Types',
          'Classes',
          'Pattern matching',
          'Collections',
          'Errors',
          'Libraries',
          'Borrowed from other languages',
        ],
      },
      {
        text: 'Getting Started',
        link: '/guide/getting-started/',
        outline: [
          'Install the toolchain',
          'Create a project',
          'Build and run',
          'Editor setup',
          'Next steps',
        ],
      },
      {
        text: 'Your First Program',
        link: '/guide/first-program/',
        outline: [
          'Hello, world',
          'Adding a function',
          'Types and inference',
          'Reading input',
          'Compiling to Wasm',
        ],
      },
    ],
  },
  {
    text: 'Language Basics',
    items: [
      {
        text: 'Variables',
        link: '/guide/variables/',
        outline: [
          'let and var',
          'Local and module variables',
          'Type annotations and inference',
          'Destructuring',
        ],
      },
      {
        text: 'Types',
        link: '/guide/types/',
        outline: [
          'Type system overview',
          'Taxonomy of types',
          'Type annotations',
          'Primitives, references, and boxing',
          'Nominal and structural types',
          'Generics',
          'Unions and nullability',
          'Type aliases, distinct types, and opaque types',
          'Type operators',
        ],
      },
      {
        text: 'Strings',
        link: '/guide/strings/',
        outline: [
          'Literals and templates',
          'Operations and equality',
          'Slices, views, and copies',
          'Unicode and safety',
          'Performance and representations',
        ],
      },
      {
        text: 'Functions',
        link: '/guide/functions/',
        outline: [
          'Top-level functions and arrow functions',
          'Parameters and arguments',
          'Return types and multi-value returns',
          'Function types and compatibility',
          'Function and method overloading',
          'Generators and async functions',
        ],
      },
      {
        text: 'Classes',
        link: '/guide/classes/',
        outline: [
          'Declaring a class and fields',
          'Constructors and initialization',
          'Methods and accessors',
          'Case classes and sealed hierarchies',
          'Interfaces and mixins',
          'Extension classes',
          'Inheritance and overriding',
          'Operator overloading',
          'Performance and dispatch',
        ],
      },
      {
        text: 'Control Flow',
        link: '/guide/control-flow/',
        outline: [
          'Expression orientation',
          'Conditionals with if and else',
          'Loops and iteration',
          'Multi-branch selection with match',
          'Jump statements and unwinding',
        ],
      },
      {
        text: 'Pattern Matching',
        link: '/guide/pattern-matching/',
        outline: [
          'Irrefutable patterns and destructuring',
          'Refutable patterns and match expressions',
          'Pattern taxonomy',
          'Pattern guards',
        ],
      },
      {
        text: 'Collections',
        link: '/guide/collections/',
        outline: [
          'FixedArray and Array',
          'Maps and Sets',
          'Iterating',
          'Choosing a collection',
        ],
      },
      {
        text: 'Errors',
        link: '/guide/errors/',
        outline: [
          'Throwing and catching',
          'try as an expression',
          'Errors versus result values',
          'When to use which',
        ],
      },
      {
        text: 'Async Programming',
        link: '/guide/async/',
        outline: [
          'The async/await model',
          'Execution model: Eager start and concurrency',
          'Async main',
          'Futures and combinators',
          'Structured cancellation',
        ],
      },
      {
        text: 'Resources and Ownership',
        link: '/guide/resources/',
        outline: [
          'Managed resources vs ordinary objects',
          'The Disposable protocol',
          'Deterministic cleanup with using',
          'Resource classes and affine types',
          'Handles: Own, Borrow, and Unmanaged',
          'Second-class borrows without lifetimes',
          'Regime transitions: disown and adopt',
        ],
      },
      {
        text: 'Libraries',
        link: '/guide/libraries/',
        outline: [
          'A library is a directory',
          'Imports and exports',
          'Using the standard library',
          'Depending on other packages',
        ],
      },
    ],
  },
  {
    text: 'Core Concepts',
    collapsed: true,
    items: [
      {
        text: 'The Type System',
        link: '/guide/type-system/',
        outline: [
          'Goals',
          'Assignability and subtyping',
          'Narrowing',
          'Variance',
          'What Zena deliberately leaves out',
        ],
      },
      {
        text: 'Correctness and Safety',
        link: '/guide/correctness/',
        outline: [
          'What "sound" means',
          'Where TypeScript gives up soundness',
          'What Zena does instead',
          'Memory safety without a borrow checker',
          'The cost of soundness',
        ],
      },
      {
        text: 'WebAssembly',
        link: '/guide/web-assembly/',
        outline: [
          'Targeting Wasm GC',
          'Type mapping and representation',
          'Arrays',
          'Strings',
          'Linear memory and zena:memory',
          'Classes, polymorphism, and dispatch',
          'Struct construction and immutability',
          'Functions and calling conventions',
          'Async, exceptions, and runtime execution',
        ],
      },
      {
        // Absorbed the old "Binary Size" page: compile-time cost, run-time
        // cost, and output size are the same subject and kept cross-linking.
        text: 'Performance',
        link: '/guide/performance/',
        outline: [
          'What each construct costs',
          'Monomorphized generics',
          'Devirtualization and inlining',
          'Boxing and how to avoid it',
          'What ends up in the binary',
          'Dead code elimination',
          'Measuring and benchmarking',
        ],
      },
    ],
  },
  {
    text: 'Building Things',
    collapsed: true,
    items: [
      {
        text: 'Project Layout',
        link: '/guide/project-layout/',
        outline: [
          'Anatomy of a project',
          'The package manifest',
          'Source and test directories',
          'Build output',
        ],
      },
      {
        text: 'Testing',
        link: '/guide/testing/',
        outline: [
          'Writing a test',
          'Assertions',
          'Running tests',
          'Benchmarks',
        ],
      },
      {
        text: 'Editor Support',
        link: '/guide/editor-support/',
        outline: ['VS Code', 'The language server', 'Other editors'],
      },
      {
        text: 'Formatting',
        link: '/guide/formatting/',
        outline: ['zena fmt', 'Style decisions', 'Editor integration'],
      },
      {
        text: 'Working with AI Agents',
        link: '/guide/ai-agents/',
        outline: [
          'Why Zena is designed for agent feedback loops',
          'Diagnostics agents can act on',
          'Tooling hooks',
          'Practical tips',
        ],
      },
    ],
  },
  {
    text: 'Language Comparisons',
    collapsed: true,
    items: [
      {
        text: 'TypeScript',
        link: '/guide/comparisons/typescript/',
        outline: [
          'What carries over',
          'let means immutable',
          'No implicit coercion, no any escape hatch',
          'Nominal classes',
          'Cheat sheet',
        ],
      },
      {
        text: 'AssemblyScript',
        link: '/guide/comparisons/assemblyscript/',
        outline: [
          'What carries over',
          'let means immutable',
          'No implicit coercion, no any escape hatch',
          'Nominal classes',
          'Cheat sheet',
        ],
      },
      {
        text: 'Rust',
        link: '/guide/comparisons/rust/',
        outline: [
          'GC instead of ownership',
          'Matching and sealed classes',
          'Traits versus interfaces and mixins',
          'Cheat sheet',
        ],
      },
      {
        text: 'Go',
        link: '/guide/comparisons/go/',
        outline: [
          'Nominal interfaces',
          'Errors',
          'Generics',
          'Concurrency, and what Zena has instead',
          'Cheat sheet',
        ],
      },
      {
        text: 'Swift and Dart',
        link: '/guide/comparisons/swift-dart/',
        outline: [
          'Constructors and initializer lists',
          'Mixins',
          'Optionals and non-nullable references',
          'Cheat sheet',
        ],
      },
      {
        text: 'Java, Kotlin, and Scala',
        link: '/guide/comparisons/jvm/',
        outline: [
          'Classes and sealed hierarchies',
          'Case classes and pattern matching',
          'Expression orientation',
          'Cheat sheet',
        ],
      },
    ],
  },
  {
    text: 'Targets and Interop',
    collapsed: true,
    items: [
      {
        text: 'Compile Targets',
        link: '/guide/targets/',
        outline: ['host', 'wasi', 'Choosing a target', 'Feature differences'],
      },
      {
        text: 'JavaScript Interop',
        link: '/guide/javascript-interop/',
        outline: [
          'Loading a module',
          'Passing values across the boundary',
          'Strings and the host',
          'Calling back into JavaScript',
        ],
      },
      {
        text: 'WASI and Components',
        link: '/guide/wasi/',
        outline: [
          'Running under wasmtime',
          'Capabilities',
          'WIT imports and exports',
          'The component model',
        ],
      },
    ],
  },
];

const reference = [
  {
    text: 'Introduction',
    link: '/reference/',
    outline: ['How to read this reference', 'Conventions', 'Feature status'],
  },
  {
    text: 'Libraries',
    link: '/reference/libraries/',
    outline: [
      'Libraries and source files',
      'Top-level declarations',
      'Entry points and main()',
      'Imports and exports',
      'Re-exports and host imports',
      'Library resolution',
      'Packages and manifests',
      'Initialization order',
    ],
  },
  {
    text: 'Variables',
    link: '/reference/variables/',
    outline: [
      'let',
      'var',
      'Type annotations',
      'Definite assignment',
      'Shadowing',
      'Destructuring bindings',
    ],
  },
  {
    text: 'Functions',
    link: '/reference/functions/',
    outline: [
      'Function declarations and arrow functions',
      'Parameters',
      'Types and signatures',
      'Closures',
      'Tail calls',
      'Generator functions',
      'Async functions',
    ],
  },
  {
    text: 'Expressions',
    link: '/reference/expressions/',
    outline: [
      'Expression-oriented syntax',
      'Literals',
      'Member access',
      'Calls',
      'Evaluation order',
    ],
  },
  {
    text: 'Operators',
    link: '/reference/operators/',
    outline: [
      'Arithmetic',
      'Comparison and equality',
      'Logical and null-coalescing',
      'Bitwise',
      'Assignment and compound assignment',
      'Range operators',
      'Pipelines and the placeholder ($)',
      'Operator precedence and associativity',
    ],
  },
  {
    text: 'Comments',
    link: '/reference/comments/',
    outline: ['Line comments (//)', 'Block comments (/* */)', 'Doc comments'],
  },
  {
    text: 'Data Types',
    items: [
      {
        text: 'Numbers',
        link: '/reference/numbers/',
        outline: [
          'Integers',
          'Narrow integers',
          'Floats',
          'Number literals',
          'Unsigned semantics',
          'Overflow and special values',
          'Numeric conversions',
        ],
      },
      {
        text: 'Booleans',
        link: '/reference/booleans/',
        outline: [
          'The boolean type',
          'true and false',
          'Strict conditional semantics',
        ],
      },
      {
        text: 'Strings',
        link: '/reference/strings/',
        outline: [
          'The String type',
          'String literals and escapes',
          'Template literals and interpolation',
          'Multi-line strings',
          'Tagged templates',
          'Indexing and slicing',
          'Comparison and equality',
          'Encodings and representation',
        ],
      },
      {
        text: 'Records',
        link: '/reference/records/',
        outline: [
          'Record literals',
          'Record types',
          'Spread',
          'Structural typing',
          'Representation',
        ],
      },
      {
        text: 'Tuples',
        link: '/reference/tuples/',
        outline: [
          'Tuple literals',
          'Inline tuples',
          'Multi-value returns',
          'Representation',
        ],
      },
      {
        text: 'Arrays',
        link: '/reference/arrays/',
        outline: [
          'FixedArray',
          'Array',
          'ImmutableArray',
          'Literals',
          'Indexing and bounds',
          'Slicing',
        ],
      },
      {
        text: 'Maps and Sets',
        link: '/reference/maps/',
        outline: [
          'Map',
          'OrderedMap',
          'Set',
          'Keys, hashing, and equality',
          'Literals',
        ],
      },
      {
        text: 'Ranges',
        link: '/reference/ranges/',
        outline: ['Range syntax', 'Iterating a range', 'Slicing with ranges'],
      },
      {
        text: 'Enums',
        link: '/reference/enums/',
        outline: [
          'Declaring an enum',
          'Backing types',
          'Conversions',
          'Enums versus sealed classes',
        ],
      },
    ],
  },
  {
    text: 'Types',
    items: [
      {
        text: 'Type System Overview',
        link: '/reference/types/',
        outline: [
          'The type hierarchy',
          'Assignability and subtyping',
          'Nominal versus structural',
          'anyref, void, and never',
        ],
      },
      {
        text: 'Inference',
        link: '/reference/inference/',
        outline: [
          'Local variable inference',
          'Contextual typing',
          'Return type inference',
        ],
      },
      {
        text: 'Type Aliases and Distinct Types',
        link: '/reference/type-aliases/',
        outline: ['type', 'distinct type', 'Generic aliases', 'Conversions'],
      },
      {
        text: 'Unions',
        link: '/reference/unions/',
        outline: [
          'Declaring a union',
          'Nullability',
          'What may appear in a union',
          'Why primitives are restricted',
          'Narrowing a union',
          'Literal types',
        ],
      },
      {
        text: 'Generics',
        link: '/reference/generics/',
        outline: [
          'Type parameters',
          'Constraints',
          'Monomorphization',
          'Variance',
          'Inference',
        ],
      },
      {
        text: 'Type Testing and Narrowing',
        link: '/reference/type-testing/',
        outline: [
          'The is operator',
          'The as operator',
          'Control-flow narrowing',
        ],
      },
    ],
  },
  {
    text: 'Control Flow',
    items: [
      {
        text: 'Control Flow',
        link: '/reference/control-flow/',
        outline: ['if', 'match', 'Blocks', 'return', 'throw'],
      },
      {
        text: 'Loops',
        link: '/reference/loops/',
        outline: [
          'while',
          'for',
          'for-in',
          'break and continue',
          'Labels',
          'while let',
        ],
      },
      {
        text: 'Pattern Matching',
        link: '/reference/pattern-matching/',
        outline: [
          'match expressions',
          'Pattern forms',
          'Guards',
          'Or patterns',
          'Exhaustiveness checking',
          'if let',
        ],
      },
      {
        text: 'Destructuring',
        link: '/reference/destructuring/',
        outline: [
          'Record patterns',
          'Tuple patterns',
          'Class patterns',
          'Rest and defaults',
        ],
      },
      {
        text: 'Exceptions',
        link: '/reference/exceptions/',
        outline: [
          'throw',
          'try/catch',
          'finally',
          'try as an expression',
          'The Error class',
          'Representation',
        ],
      },
      {
        text: 'Cancellation',
        link: '/reference/cancellation/',
        outline: [
          'The cancellation channel',
          'Cancel scopes',
          'Cleanup on cancellation',
          'Structured concurrency',
        ],
      },
    ],
  },
  {
    text: 'Classes',
    items: [
      {
        text: 'Introduction',
        link: '/reference/classes/',
        outline: [
          'Declaring a class',
          'Instantiation',
          'Identity and equality',
          'Representation',
        ],
      },
      {
        text: 'Fields and Constructors',
        link: '/reference/classes/fields/',
        outline: [
          'Field declarations',
          'var and let fields',
          'Private fields',
          'Asymmetric visibility',
          'Constructors',
          'this. parameters',
          'Initializer lists',
        ],
      },
      {
        text: 'Methods and Accessors',
        link: '/reference/classes/methods/',
        outline: [
          'Methods',
          'Getters and setters',
          'Static members',
          'Generic methods',
        ],
      },
      {
        text: 'Inheritance',
        link: '/reference/classes/inheritance/',
        outline: [
          'extends',
          'Overriding',
          'abstract and final',
          'Method resolution',
          'Virtual dispatch',
        ],
      },
      {
        text: 'Interfaces',
        link: '/reference/classes/interfaces/',
        outline: [
          'Declaring an interface',
          'implements',
          'Interface inheritance',
          'Default members',
          'Representation',
        ],
      },
      {
        text: 'Mixins',
        link: '/reference/classes/mixins/',
        outline: [
          'Declaring a mixin',
          'on constraints',
          'with clauses',
          'Linearization',
        ],
      },
      {
        text: 'Sealed and Case Classes',
        link: '/reference/classes/sealed/',
        outline: [
          'sealed class',
          'case declarations',
          'Case class shorthand',
          'Generated members',
          'Exhaustive matching',
        ],
      },
      {
        text: 'Extension Classes',
        link: '/reference/classes/extensions/',
        outline: [
          'Declaring an extension',
          'Resolution rules',
          'Extending primitives',
          'Limitations',
        ],
      },
      {
        text: 'Operator Overloads',
        link: '/reference/classes/operators/',
        outline: ['operator ==', 'operator hash', 'Other operators'],
      },
    ],
  },
  {
    text: 'Attributes',
    items: [
      {
        text: 'Decorators and Intrinsics',
        link: '/reference/decorators/',
        outline: ['@intrinsic', '@pure', 'Other attributes', 'Status'],
      },
    ],
  },
  {
    text: 'Standard Library',
    collapsed: true,
    items: [
      {
        text: 'Overview',
        link: '/reference/stdlib/',
        outline: ['What ships with Zena', 'Importing', 'Stability'],
      },
      // One entry per module the standard library exports, from the
      // extracted API rather than a list kept by hand: a module added to
      // the stdlib manifest appears here, and one removed stops
      // appearing, without anyone editing this file.
      ...stdlibModules(),
    ],
  },
  {
    text: 'Toolchain',
    collapsed: true,
    items: [
      {
        text: 'CLI',
        link: '/reference/cli/',
        outline: [
          'zena build',
          'zena run',
          'zena test',
          'zena fmt',
          'zena lsp',
          'Global options',
        ],
      },
      {
        text: 'Compile Targets',
        link: '/reference/compile-targets/',
        outline: ['host', 'wasi', 'Target-specific behaviour'],
      },
      {
        text: 'Compiler Flags',
        link: '/reference/compiler-flags/',
        outline: [
          'Output',
          'Optimization',
          'Encoding',
          'Diagnostics',
          'Debugging',
        ],
      },
      {
        text: 'Formatter',
        link: '/reference/formatter/',
        outline: ['Usage', 'Formatting rules', 'Ignoring code'],
      },
      {
        text: 'Language Server',
        link: '/reference/language-server/',
        outline: ['Capabilities', 'Configuration'],
      },
    ],
  },
  {
    text: 'Appendix',
    collapsed: true,
    items: [
      {text: 'Grammar', link: '/reference/grammar/'},
      {text: 'Keywords', link: '/reference/keywords/'},
    ],
  },
];

const development = [
  {
    text: 'Development',
    items: [
      {
        text: 'Overview',
        link: '/development/',
        outline: [
          'How the project works',
          'Why the language is like this',
          'Where to start',
        ],
      },
      {
        text: 'Built with AI',
        link: '/development/built-with-ai/',
        outline: [
          'What "almost entirely" means',
          'How the loop works',
          'What the language does to help',
          'What has gone wrong',
          'What we have learned',
        ],
      },
      {
        text: 'Status and Roadmap',
        link: '/development/roadmap/',
        outline: [
          'Where things stand',
          'What is next',
          'Further out',
          'What is not planned',
        ],
      },
      {
        text: 'Contributing',
        link: '/development/contributing/',
        outline: [
          'Getting set up',
          'Repository layout',
          'Tests and formatting',
          'Working alongside agents',
          'Opening a change',
        ],
      },
    ],
  },
  {
    text: 'Design',
    items: [
      {
        text: 'Overview',
        link: '/development/design/',
        outline: ['Decisions', 'The working documents'],
      },
      {
        text: 'Strings',
        link: '/development/design/strings/',
        outline: [
          'Problem',
          'Goals',
          'Design overview',
          'Host interop',
          'Current implementation',
        ],
      },
      {
        text: 'Multi-value returns',
        link: '/development/design/multi-value-returns/',
        outline: [
          'Motivation',
          'The shape Zena uses',
          'Option still exists',
          'Errors',
          'Planned changes',
        ],
      },
      {
        text: 'Union types',
        link: '/development/design/unions/',
        outline: [
          'Two questions',
          'Illegal unions',
          'Allowed unions',
          'Casts and type checks',
        ],
      },
      {
        text: 'Classes and interfaces',
        link: '/development/design/classes-and-interfaces/',
        outline: [
          'Classes are Wasm structs',
          'Virtual calls go through a vtable',
          'Calls are devirtualized when the target is unambiguous',
          'Interfaces are fat pointers',
          'Mixins become classes',
        ],
      },
      {
        text: 'Generics',
        link: '/development/design/generics/',
        outline: [
          'Generics are reified',
          'Generics are monomorphized',
          'Generic methods',
          'Variance',
          'Constraints',
          'Casts and type checks',
          'Soundness',
        ],
      },
      {
        text: 'Literal types',
        link: '/development/design/literal-types/',
        outline: [
          'Literal types are not sound',
          'is tests the base type',
          'Values from outside the program are unchecked',
        ],
      },
      {
        text: 'Distinct types',
        link: '/development/design/distinct-types/',
        outline: [
          'Distinct types are opaque in both directions',
          'Distinct types are not sound',
          'is tests the base type',
          'Erasure restricts unions and matching',
        ],
      },
      {
        text: 'Automatic boxing',
        link: '/development/design/automatic-boxing/',
        outline: ['Why it is rejected', 'No any', 'anyref is a different type'],
      },
      {
        text: 'Regular expressions',
        link: '/development/design/regex/',
        outline: [
          'Engine size',
          'No JIT in Wasm',
          'Linear-time matching',
          'Compile-time specialization',
          'Patterns as strings',
        ],
      },
    ],
  },
];

export default {
  '/guide/': guide,
  '/reference/': reference,
  '/development/': development,
};
