-- Reports and dashboards filter completed bills by branch / stylist and close time, and money records by branch and date.
CREATE INDEX "Session_branchId_status_closedAt_idx" ON "Session"("branchId", "status", "closedAt");
CREATE INDEX "Session_stylistId_status_closedAt_idx" ON "Session"("stylistId", "status", "closedAt");
CREATE INDEX "BranchTransaction_branchId_createdAt_idx" ON "BranchTransaction"("branchId", "createdAt");
