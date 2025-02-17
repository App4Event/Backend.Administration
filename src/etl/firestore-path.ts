export const performer = (language: string, id: string) => {
  return `performers/${language}/${id}`
}

export const firestorePath = {
  performer,
}
