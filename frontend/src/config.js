// The API base URL is public information (the endpoint is called from the browser).
// An Amplify environment variable VITE_API_URL overrides it if the stack is redeployed.
export const API_URL =
  import.meta.env.VITE_API_URL || "https://vqx9iu9ggb.execute-api.us-east-1.amazonaws.com";
