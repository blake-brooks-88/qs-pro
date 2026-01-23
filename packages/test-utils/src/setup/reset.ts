// Counter reset functions - call in beforeEach to ensure test isolation
let userSessionCounter = 0;
let shellQueryCounter = 0;
let bullJobCounter = 0;

export function resetUserSessionCounter(): void {
  userSessionCounter = 0;
}

export function resetShellQueryCounter(): void {
  shellQueryCounter = 0;
}

export function resetBullJobCounter(): void {
  bullJobCounter = 0;
}

export function resetFactories(): void {
  resetUserSessionCounter();
  resetShellQueryCounter();
  resetBullJobCounter();
}

export function resetAllMocks(): void {
  resetFactories();
}

// Export counter getters for factory use
export function getNextUserSessionId(): number {
  return ++userSessionCounter;
}

export function getNextShellQueryId(): number {
  return ++shellQueryCounter;
}

export function getNextBullJobId(): number {
  return ++bullJobCounter;
}
