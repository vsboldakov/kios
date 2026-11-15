import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { ConfirmDialog } from "./confirm-dialog"

test("copies the command from the left button and leaves the dialog open", async () => {
  const copied: string[] = []
  let outcome = ""
  const setup = await testRender(
    () => (
      <ConfirmDialog
        title="Cordon"
        message="kubectl cordon worker"
        onConfirm={() => {
          outcome = "confirm"
        }}
        onCancel={() => {
          outcome = "cancel"
        }}
        onCopy={(text) => copied.push(text)}
      />
    ),
    { width: 80, height: 24 },
  )
  try {
    await setup.waitForFrame((frame) => frame.includes("Copy") && frame.includes("kubectl cordon worker"))
    const copy = locate(setup, "Copy")

    setup.mockInput.pressArrow("left")
    setup.mockInput.pressEnter()
    expect(outcome).toBe("cancel")
    expect(copied).toEqual([])

    setup.mockInput.pressArrow("left")
    setup.mockInput.pressEnter()
    expect(copied).toEqual(["kubectl cordon worker"])
    expect(outcome).toBe("cancel")
    const notice = await setup.waitForFrame((frame) => frame.includes("Copied to clipboard"))
    expect(notice).toContain("kubectl cordon worker")
    const toast = locate(setup, "Copied to clipboard")

    await setup.mockMouse.click(toast.x, toast.y)
    const dismissed = await setup.waitForFrame((frame) => !frame.includes("Copied to clipboard"))
    expect(dismissed).toContain("kubectl cordon worker")
    expect(outcome).toBe("cancel")

    await setup.mockMouse.click(copy.x, copy.y)
    expect(copied).toEqual(["kubectl cordon worker", "kubectl cordon worker"])
    expect(outcome).toBe("cancel")
    expect(await setup.waitForFrame((frame) => frame.includes("Copied to clipboard"))).toContain("kubectl cordon worker")
  } finally {
    await setup.dispose()
  }
})

function locate(setup: Awaited<ReturnType<typeof testRender>>, text: string) {
  const lines = setup.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  return { x: y < 0 ? -1 : lines[y]!.indexOf(text), y }
}
