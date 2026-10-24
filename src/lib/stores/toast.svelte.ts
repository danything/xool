class ToastStore {
  message = $state<string>();
}

export const toastStore = new ToastStore();

export function setMessage(value: string) {
  toastStore.message = value;
}
