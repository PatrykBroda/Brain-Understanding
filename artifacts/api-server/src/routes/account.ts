import { Router, type IRouter, type Request, type Response } from "express";
import {
  AccountNotFoundError,
  deleteAccountData,
} from "../lib/accountDeletionService";

const router: IRouter = Router();

// DELETE /account — permanently removes the authenticated user and all data
// owned by that account. This route is mounted after requireAuth.
router.delete("/account", async (req: Request, res: Response) => {
  try {
    const result = await deleteAccountData(req.userId as string);
    if (result.pendingAttachmentFiles > 0) {
      req.log.warn(
        { pendingAttachmentFiles: result.pendingAttachmentFiles },
        "account deleted; attachment file cleanup queued for retry",
      );
    }
    req.log.info("account permanently deleted");
    res.json({ deleted: true });
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    req.log.error({ err: error }, "account deletion failed");
    res.status(500).json({ error: "Could not delete account. Please try again." });
  }
});

export default router;