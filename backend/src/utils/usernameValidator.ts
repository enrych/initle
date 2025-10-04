class UsernameValidator {
  private constructor() {}

  public static isPresent(username?: string): boolean {
    return !!username && username.trim().length > 0;
  }
}

export default UsernameValidator;
