import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RedcareAddKeywordForm from "./RedcareAddKeywordForm";

const mockCreateWatch = vi.fn<(data: unknown) => Promise<any>>(async () => ({}));
vi.mock("@/lib/api", () => ({
  api: {
    marketingRedcare: {
      createWatch: (data: unknown) => mockCreateWatch(data),
    },
  },
}));

describe("RedcareAddKeywordForm", () => {
  beforeEach(() => {
    mockCreateWatch.mockReset();
    mockCreateWatch.mockResolvedValue({});
  });

  it("adds a keyword+EAN pair without requiring a prior search result", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    render(<RedcareAddKeywordForm onAdded={onAdded} />);

    await user.type(screen.getByPlaceholderText(/ean o codice prodotto/i), "8057808520034");
    await user.type(screen.getByPlaceholderText(/nome prodotto/i), "Deiscente VENAVIL");
    await user.type(screen.getByPlaceholderText(/parola chiave/i), "diosmina esperidina");
    await user.click(screen.getByRole("button", { name: /aggiungi/i }));

    expect(mockCreateWatch).toHaveBeenCalledWith({
      market: "IT",
      ean: "8057808520034",
      label: "Deiscente VENAVIL",
      keyword: "diosmina esperidina",
      isOwn: true,
    });
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it("sends isOwn=false and an empty label when tracking a competitor without a product name", async () => {
    const user = userEvent.setup();
    render(<RedcareAddKeywordForm onAdded={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox"), "DE");
    await user.type(screen.getByPlaceholderText(/ean o codice prodotto/i), "4000000000000");
    await user.type(screen.getByPlaceholderText(/parola chiave/i), "vitamina d");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /aggiungi/i }));

    expect(mockCreateWatch).toHaveBeenCalledWith({
      market: "DE",
      ean: "4000000000000",
      label: undefined,
      keyword: "vitamina d",
      isOwn: false,
    });
  });

  it("disables the submit button until both EAN and keyword are filled", async () => {
    const user = userEvent.setup();
    render(<RedcareAddKeywordForm onAdded={vi.fn()} />);

    expect(screen.getByRole("button", { name: /aggiungi/i })).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/ean o codice prodotto/i), "123");
    expect(screen.getByRole("button", { name: /aggiungi/i })).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/parola chiave/i), "keyword");
    expect(screen.getByRole("button", { name: /aggiungi/i })).toBeEnabled();
    expect(mockCreateWatch).not.toHaveBeenCalled();
  });

  it("clears the form and shows an error instead of crashing when the API call fails", async () => {
    const user = userEvent.setup();
    mockCreateWatch.mockRejectedValueOnce(new Error("boom"));
    render(<RedcareAddKeywordForm onAdded={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/ean o codice prodotto/i), "123");
    await user.type(screen.getByPlaceholderText(/parola chiave/i), "keyword");
    await user.click(screen.getByRole("button", { name: /aggiungi/i }));

    expect(await screen.findByText(/impossibile aggiungere/i)).toBeInTheDocument();
    // Form values are preserved on failure so the user doesn't retype everything.
    expect(screen.getByPlaceholderText(/ean o codice prodotto/i)).toHaveValue("123");
  });
});
