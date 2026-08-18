import { supabase } from './supabase';

export interface BorrowableItem {
  item_id: number;
  item_code: string;
  item_name: string;
  item_description?: string;
  item_category?: string;
  status: 'Available' | 'Damaged' | 'Archived';
  created_at: string;
}

export interface BorrowRecord {
  borrow_id: number;
  event_id: number;
  participant_id: number;
  item_id: number;
  borrowed_at: string;
  returned_at?: string;
  returned_by_participant_id?: number;
  scanner_device?: string;
  notes?: string;
  created_at: string;
}

export interface ActiveBorrow {
  borrow_id: number;
  item_id: number;
  item_name: string;
  item_code: string;
  borrowed_at: string;
}

/**
 * An item that is out on loan right now. Whether an item is held is not part of
 * `status` — that column is the item's lifecycle (Available / Damaged /
 * Archived) and says nothing about where the item physically is. Being on loan
 * is owned by borrowed_items.returned_at and is always derived from it, so the
 * two can never drift apart.
 */
export interface ActiveLoan {
  borrow_id: number;
  item_id: number;
  participant_id: number;
  participant_name: string;
  borrowed_at: string;
}

export interface BorrowHistory {
  borrow_id: number;
  participant_id: number;
  participant_name: string;
  item_id: number;
  item_name: string;
  borrowed_at: string;
  returned_at?: string;
  duration_minutes: number;
  status: 'Unreturned' | 'Returned';
}

/**
 * One loan in a single item's lifetime, across every event it was lent at.
 * Where BorrowHistory answers "what happened at this event", this answers
 * "where has this item been".
 */
export interface ItemBorrowHistory {
  borrow_id: number;
  event_id: number;
  event_name: string;
  participant_id: number;
  participant_name: string;
  borrowed_at: string;
  returned_at?: string;
  duration_minutes: number;
  status: 'Unreturned' | 'Returned';
}

/** Per-record outcome of a bulk return, so partial success is reportable. */
export interface BulkReturnResult {
  returned: number[];
  /** Closed by someone else before this call landed — not an error. */
  alreadyReturned: number[];
  failed: number[];
}

export interface ParticipantBorrowHistory {
  borrow_id: number;
  item_id: number;
  item_name: string;
  item_code: string;
  borrowed_at: string;
  returned_at?: string;
  duration_minutes: number;
  status: 'Unreturned' | 'Returned';
}

/** How long an open loan has been running, in minutes, as of right now. */
export function elapsedMinutes(since: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
}

/** "45m", "2h", "2h 15m" — the shared reading of a loan's length. */
export function formatBorrowDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export const borrowService = {
  // ==================== Item Lookup ====================

  /**
   * Lookup item by QR code (item_code) for a specific office.
   *
   * Deliberately does NOT filter on status. An item marked Damaged while it was
   * out on loan still has to be scannable, or it can never be returned — the
   * caller decides what each status permits. Borrowing checks for 'Available';
   * returning accepts any.
   */
  async getItemByCode(itemCode: string, officeId: number): Promise<BorrowableItem | null> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .select('*')
      .eq('item_code', itemCode.trim())
      .eq('office_id', officeId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching item by code:', error);
      return null;
    }

    return data;
  },

  /**
   * Which of the given items are out on loan, and who holds them.
   *
   * Two plain queries rather than a PostgREST embed: borrowed_items carries two
   * foreign keys to participants (participant_id and returned_by_participant_id),
   * so an embed would be ambiguous and need a constraint-name hint that breaks
   * if the constraint is ever renamed.
   */
  async getActiveLoansForItems(itemIds: number[]): Promise<ActiveLoan[]> {
    if (itemIds.length === 0) return [];

    const { data: loans, error } = await supabase
      .from('borrowed_items')
      .select('borrow_id, item_id, participant_id, borrowed_at')
      .in('item_id', itemIds)
      .is('returned_at', null);

    if (error) {
      console.error('Error fetching active loans:', error);
      throw error;
    }

    const rows = loans || [];
    if (rows.length === 0) return [];

    const participantIds = Array.from(new Set(rows.map((r) => r.participant_id)));
    const { data: people, error: peopleError } = await supabase
      .from('participants')
      .select('participant_id, full_name')
      .in('participant_id', participantIds);

    if (peopleError) {
      console.error('Error fetching loan holders:', peopleError);
      throw peopleError;
    }

    const nameById = new Map<number, string>(
      (people || []).map((p: { participant_id: number; full_name: string }) => [
        p.participant_id,
        p.full_name,
      ])
    );

    return rows.map((r) => ({
      borrow_id: r.borrow_id,
      item_id: r.item_id,
      participant_id: r.participant_id,
      participant_name: nameById.get(r.participant_id) ?? 'Unknown',
      borrowed_at: r.borrowed_at,
    }));
  },

  /**
   * Every loan this item has ever been part of, newest first.
   *
   * Three plain queries rather than embeds, for the same reason
   * getActiveLoansForItems uses two: the double participant foreign key makes an
   * embed ambiguous. Duration mirrors get_borrow_history — minutes held so far
   * for an open loan, total held for a closed one — so a row reads the same here
   * as it does in the History Log.
   */
  async getItemBorrowHistory(itemId: number): Promise<ItemBorrowHistory[]> {
    const { data: borrows, error } = await supabase
      .from('borrowed_items')
      .select('borrow_id, event_id, participant_id, borrowed_at, returned_at')
      .eq('item_id', itemId)
      .order('borrowed_at', { ascending: false });

    if (error) {
      console.error('Error fetching item borrow history:', error);
      throw error;
    }

    const rows = borrows || [];
    if (rows.length === 0) return [];

    const [people, events] = await Promise.all([
      supabase
        .from('participants')
        .select('participant_id, full_name')
        .in('participant_id', Array.from(new Set(rows.map((r) => r.participant_id)))),
      supabase
        .from('events')
        .select('event_id, event_name')
        .in('event_id', Array.from(new Set(rows.map((r) => r.event_id)))),
    ]);

    if (people.error) {
      console.error('Error fetching borrowers:', people.error);
      throw people.error;
    }
    if (events.error) {
      console.error('Error fetching events for item history:', events.error);
      throw events.error;
    }

    const nameById = new Map<number, string>(
      (people.data || []).map((p: { participant_id: number; full_name: string }) => [
        p.participant_id,
        p.full_name,
      ])
    );
    const eventById = new Map<number, string>(
      (events.data || []).map((e: { event_id: number; event_name: string }) => [
        e.event_id,
        e.event_name,
      ])
    );

    return rows.map((r) => {
      const end = r.returned_at ? new Date(r.returned_at) : new Date();
      const minutes = Math.max(
        0,
        Math.floor((end.getTime() - new Date(r.borrowed_at).getTime()) / 60000)
      );

      return {
        borrow_id: r.borrow_id,
        event_id: r.event_id,
        event_name: eventById.get(r.event_id) ?? 'Unknown event',
        participant_id: r.participant_id,
        participant_name: nameById.get(r.participant_id) ?? 'Unknown',
        borrowed_at: r.borrowed_at,
        returned_at: r.returned_at ?? undefined,
        duration_minutes: minutes,
        status: r.returned_at ? 'Returned' : 'Unreturned',
      };
    });
  },

  /**
   * Get all available items for an office
   */
  async getAvailableItems(officeId: number): Promise<BorrowableItem[]> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .select('*')
      .eq('office_id', officeId)
      .eq('status', 'Available')
      .order('item_name', { ascending: true });

    if (error) {
      console.error('Error fetching available items:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Get all items (including damaged/archived) for an office
   */
  async getAllItems(officeId: number): Promise<BorrowableItem[]> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .select('*')
      .eq('office_id', officeId)
      .order('item_name', { ascending: true });

    if (error) {
      console.error('Error fetching all items:', error);
      return [];
    }

    return data || [];
  },

  // ==================== Item Management ====================

  /**
   * Create a new borrowable item for an office.
   *
   * item_code is deliberately absent from the payload: the borrowable_items
   * BEFORE INSERT trigger derives it from the category and a shared sequence
   * (TAB-0001, LAP-0002, ...). Sending the key at all — even as null or '' —
   * risks suppressing that, so it is omitted entirely and read back off the
   * inserted row.
   *
   * Throws on failure so the caller can report the real cause rather than a
   * generic "could not add".
   */
  async createItem(
    officeId: number,
    itemName: string,
    itemDescription?: string,
    itemCategory?: string
  ): Promise<BorrowableItem> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .insert({
        office_id: officeId,
        item_name: itemName.trim(),
        item_description: itemDescription?.trim() || null,
        item_category: itemCategory?.trim() || null,
        status: 'Available',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating item:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update item details. Scoped by office so an id from another office cannot
   * be edited even if it is guessed.
   */
  async updateItem(
    itemId: number,
    officeId: number,
    updates: Partial<Omit<BorrowableItem, 'item_id' | 'office_id' | 'created_at'>>
  ): Promise<BorrowableItem> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .update(updates)
      .eq('item_id', itemId)
      .eq('office_id', officeId)
      .select()
      .single();

    if (error) {
      console.error('Error updating item:', error);
      throw error;
    }

    return data;
  },

  /**
   * Move an item between Available / Damaged / Archived.
   */
  async setItemStatus(
    itemId: number,
    officeId: number,
    status: BorrowableItem['status']
  ): Promise<BorrowableItem> {
    return this.updateItem(itemId, officeId, { status });
  },

  // ==================== Borrow Operations ====================

  /**
   * Create a borrow record (participant borrows an item)
   */
  async borrowItem(
    eventId: number,
    participantId: number,
    itemId: number,
    scannerDevice?: string
  ): Promise<BorrowRecord | null> {
    const { data, error } = await supabase
      .rpc('create_borrow', {
        p_event_id: eventId,
        p_participant_id: participantId,
        p_item_id: itemId,
        p_scanner_device: scannerDevice,
      });

    if (error) {
      console.error('Error creating borrow record:', error);
      return null;
    }

    return data as BorrowRecord;
  },

  /**
   * Return a borrowed item
   */
  async returnItem(
    borrowId: number,
    returnedByParticipantId: number,
    scannerDevice?: string,
    notes?: string
  ): Promise<BorrowRecord | null> {
    const { data, error } = await supabase
      .rpc('return_borrow', {
        p_borrow_id: borrowId,
        p_returned_by_participant_id: returnedByParticipantId,
        p_scanner_device: scannerDevice,
        p_notes: notes,
      });

    if (error) {
      console.error('Error returning item:', error);
      return null;
    }

    return data as BorrowRecord;
  },

  /**
   * Close several borrows at once, for a desk return recorded off-scanner.
   *
   * Each entry carries its own participant id because return_borrow stamps
   * returned_by_participant_id, and a manual return has no scanning participant
   * to attribute it to — the borrower is recorded as having brought the item
   * back, which is what actually happened.
   *
   * A row someone else closed between the page load and this call is reported
   * separately rather than as a failure: the caller's intent (the item is back)
   * already holds, so there is nothing for the operator to retry.
   */
  async returnItems(
    borrows: { borrowId: number; participantId: number }[],
    notes?: string
  ): Promise<BulkReturnResult> {
    const result: BulkReturnResult = { returned: [], alreadyReturned: [], failed: [] };

    // Small concurrent batches: a bulk return is a handful to a few dozen rows,
    // and one round-trip each would leave the operator watching a spinner.
    const BATCH_SIZE = 8;
    for (let i = 0; i < borrows.length; i += BATCH_SIZE) {
      const batch = borrows.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ borrowId, participantId }) => {
          const { error } = await supabase.rpc('return_borrow', {
            p_borrow_id: borrowId,
            p_returned_by_participant_id: participantId,
            p_scanner_device: null,
            p_notes: notes,
          });

          if (!error) {
            result.returned.push(borrowId);
            return;
          }

          // P0002 is the SQLSTATE behind the RPC's no_data_found guard, raised
          // when the row is gone or already closed. The message check is a
          // fallback for deployments that surface the raise without the code.
          if (error.code === 'P0002' || /already returned/i.test(error.message || '')) {
            result.alreadyReturned.push(borrowId);
            return;
          }

          console.error(`Error returning borrow ${borrowId}:`, error);
          result.failed.push(borrowId);
        })
      );
    }

    return result;
  },

  // ==================== Query Operations ====================

  /**
   * Get active (unreturned) borrows for a participant in an event
   */
  async getActiveBorrows(
    participantId: number,
    eventId: number
  ): Promise<ActiveBorrow[]> {
    const { data, error } = await supabase
      .rpc('get_active_borrows', {
        p_participant_id: participantId,
        p_event_id: eventId,
      });

    if (error) {
      console.error('Error fetching active borrows:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Event ids that have at least one borrow recorded against them.
   * Lets the history page offer only events that have something to show,
   * rather than every event the user can reach.
   */
  async getEventIdsWithBorrows(): Promise<number[]> {
    const { data, error } = await supabase
      .from('borrowed_items')
      .select('event_id');

    if (error) {
      console.error('Error fetching events with borrows:', error);
      throw error;
    }

    return Array.from(
      new Set((data || []).map((row: { event_id: number }) => Number(row.event_id)))
    ).filter((id) => Number.isSafeInteger(id) && id > 0);
  },

  /**
   * Get full borrow history for an event.
   * Throws rather than returning [] — a missing RPC or a permissions failure is
   * indistinguishable from "nothing borrowed yet" once it is swallowed, and that
   * is the one thing the history page must not get wrong.
   */
  async getBorrowHistory(eventId: number): Promise<BorrowHistory[]> {
    const { data, error } = await supabase
      .rpc('get_borrow_history', {
        p_event_id: eventId,
      });

    if (error) {
      console.error('Error fetching borrow history:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Get borrow history for a specific participant in an event
   */
  async getParticipantBorrowHistory(
    participantId: number,
    eventId: number
  ): Promise<ParticipantBorrowHistory[]> {
    const { data, error } = await supabase
      .rpc('get_participant_borrow_history', {
        p_participant_id: participantId,
        p_event_id: eventId,
      });

    if (error) {
      console.error('Error fetching participant borrow history:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Find a borrow record by ID
   */
  async getBorrowById(borrowId: number): Promise<BorrowRecord | null> {
    const { data, error } = await supabase
      .from('borrowed_items')
      .select('*')
      .eq('borrow_id', borrowId)
      .single();

    if (error) {
      console.error('Error fetching borrow record:', error);
      return null;
    }

    return data;
  },

  /**
   * Get all unreturned items for an event (admin view)
   */
  async getUnreturnedItems(eventId: number): Promise<BorrowHistory[]> {
    const history = await this.getBorrowHistory(eventId);
    return history.filter((h) => h.status === 'Unreturned');
  },
};
