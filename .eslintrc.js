module.exports = {
  ...require('@ackee/styleguide-backend-config/eslint'),
  // PRidat do readme tohoto tuto zmenu + ten file eslint tsconfig https://github.com/AckeeCZ/styleguide-backend-config#setup
  parserOptions: {
    project: '.eslint.tsconfig.json',
  },
  // rules: {
    //     ...require('@ackee/styleguide-backend-config/eslint').rules,
    //     "@typescript-eslint/consistent-type-definitions": ["error", "type"], -> OK
    // "require-await": 0, -> https://github.com/AckeeCZ/styleguide-backend-config/blob/master/eslint.md
    //     "@typescript-eslint/no-empty-function": ["off"], -> PR na todo funkce
    //     "@typescript-eslint/no-floating-promises": "off", -> OK
    //     "sonarjs/prefer-immediate-return": "off" *> OK
  // },
}
