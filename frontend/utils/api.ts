import { HTTP_METHOD } from "constants/global.constants";

type ApiOptions =
  | { method?: typeof HTTP_METHOD.GET }
  | { method: typeof HTTP_METHOD.POST; body: unknown };

export const api = async (endpoint: string, options: ApiOptions = {}) => {
  try {
    const { method = HTTP_METHOD.GET, ...rest } = options;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (method === HTTP_METHOD.POST && "body" in options) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const res = await fetch(
      `${import.meta.env.VITE_SERVER_URL}/${endpoint}`,
      fetchOptions,
    );

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
};
