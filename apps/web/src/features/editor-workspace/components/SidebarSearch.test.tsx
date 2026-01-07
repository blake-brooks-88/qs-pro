import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidebarSearch, SidebarSearchResults, SidebarSearchResultItem, SidebarSearchRoot } from "./SidebarSearch";

describe("SidebarSearch", () => {
  it("SidebarSearch_OnRender_ShowsPlaceholder", () => {
    // Arrange
    render(<SidebarSearch placeholder="Search folders..." />);
    
    // Assert
    expect(screen.getByPlaceholderText("Search folders...")).toBeInTheDocument();
  });

  it("SidebarSearch_OnType_CallsOnChange", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SidebarSearch onChange={onChange} />);
    const input = screen.getByRole("textbox");

    // Act
    await user.type(input, "test");

    // Assert
    expect(onChange).toHaveBeenCalled();
  });

  it("SidebarSearch_OnClear_CallsOnClearAndEmptyValue", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<SidebarSearch value="test" onClear={onClear} showClear readOnly />);
    
    // Act
    const clearButton = screen.getByRole("button", { name: /clear search/i });
    await user.click(clearButton);

    // Assert
    expect(onClear).toHaveBeenCalled();
  });

  it("SidebarSearchResults_WhenOpen_DisplaysChildren", () => {
    // Arrange
    render(
      <SidebarSearchResults isOpen={true}>
        <div data-testid="child">Result</div>
      </SidebarSearchResults>
    );

    // Assert
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("SidebarSearchResults_WhenClosed_DoesNotRender", () => {
    // Arrange
    render(
      <SidebarSearchResults isOpen={false}>
        <div data-testid="child">Result</div>
      </SidebarSearchResults>
    );

    // Assert
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });

  it("SidebarSearchResultItem_WhenActive_HasActiveStyles", () => {
    // Arrange
    render(<SidebarSearchResultItem active={true}>Item</SidebarSearchResultItem>);
    
    // Assert
    const item = screen.getByRole("option");
    expect(item).toHaveAttribute("aria-selected", "true");
    expect(item).toHaveClass("bg-primary");
  });

  it("SidebarSearchResultItem_OnClick_CallsOnClick", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SidebarSearchResultItem onClick={onClick}>Item</SidebarSearchResultItem>);
    
    // Act
    await user.click(screen.getByRole("option"));

    // Assert
    expect(onClick).toHaveBeenCalled();
  });

  it("SidebarSearch_OnKeyDownArrowDown_CyclesThroughItems", async () => {
    const user = userEvent.setup();
    const TestComponent = () => {
      const [activeIndex, setActiveIndex] = React.useState(-1);
      const items = ["Item 1", "Item 2", "Item 3"];
      
      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
          setActiveIndex(prev => (prev + 1) % items.length);
        } else if (e.key === "ArrowUp") {
          setActiveIndex(prev => (prev - 1 + items.length) % items.length);
        }
      };

      return (
        <div>
          <SidebarSearch onKeyDown={handleKeyDown} />
          <SidebarSearchResults isOpen={true}>
            {items.map((item, i) => (
              <SidebarSearchResultItem key={item} active={i === activeIndex}>
                {item}
              </SidebarSearchResultItem>
            ))}
          </SidebarSearchResults>
        </div>
      );
    };

    render(<TestComponent />);
    const input = screen.getByRole("textbox");

    // Act
    await user.type(input, "{arrowdown}");
    
    // Assert
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Act
    await user.type(input, "{arrowdown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("SidebarSearch_OnKeyDownEscape_ClosesResults", async () => {
    const user = userEvent.setup();
    const TestComponent = () => {
      const [isOpen, setIsOpen] = React.useState(true);
      return (
        <div>
          <SidebarSearch onKeyDown={(e) => e.key === "Escape" && setIsOpen(false)} />
          <SidebarSearchResults isOpen={isOpen}>
            <SidebarSearchResultItem>Item</SidebarSearchResultItem>
          </SidebarSearchResults>
        </div>
      );
    };

    render(<TestComponent />);
    const input = screen.getByRole("textbox");

    // Act
    await user.type(input, "{escape}");

    // Assert
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("SidebarSearchRoot_OnClickOutside_CallsOnOpenChange", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <SidebarSearchRoot onOpenChange={onOpenChange}>
          <SidebarSearch />
        </SidebarSearchRoot>
      </div>
    );

    // Act
    await user.click(screen.getByTestId("outside"));

    // Assert
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
