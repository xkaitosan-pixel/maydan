import { useEffect } from "react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return null;
}
