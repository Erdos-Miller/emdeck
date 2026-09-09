export interface Field {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  optional?: boolean;
  type?: string;
  options?: {
    value: string;
    label: string;
  }[];
}
export interface DialogSpec {
  title: string;
  description?: string;
  fields?: Field[];
  submit?: string;
  danger?: boolean;
  resolve: (value: Record<string, string> | null) => void;
}
