// Global Vitest setup — extends `expect` with @testing-library/jest-dom's
// DOM matchers (toBeInTheDocument, toHaveTextContent, etc.). Safe to load
// for every test, not just jsdom-environment ones — it only adds matchers,
// it doesn't require a DOM to import.
import "@testing-library/jest-dom/vitest";
