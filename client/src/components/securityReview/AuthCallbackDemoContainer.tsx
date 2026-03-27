import { useAuthCallbackDemo } from "./useAuthCallbackDemo";

export const AuthCallbackDemoContainer = () => {
  const { description } = useAuthCallbackDemo();

  return <div>{description}</div>;
};
