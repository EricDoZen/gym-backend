export const openApiDoc = {
  openapi: '3.0.3',
  info: {
    title: 'Elite Myanmar Gym API',
    version: '1.1.1',
    description:
      'Production V1.1 Operations API for Elite Myanmar gym management: configurable packages, permission-based staff roles, immutable payment adjustments, trainer scheduling, reports and internal notifications. Staff and member portal JWTs are intentionally separated.',
  },
  servers: [
    { url: 'https://gym-backend-wheat.vercel.app', description: 'Production' },
    { url: 'http://localhost:8787', description: 'Local development' },
  ],
  tags: [
    { name: 'Health', description: 'Service health checks' },
    { name: 'Auth', description: 'Staff authentication' },
    { name: 'Dashboard', description: 'Owner dashboard metrics' },
    { name: 'Members', description: 'Member management, command-center overview, notes and check-ins' },
    { name: 'Packages', description: 'Configurable membership packages and price history' },
    { name: 'Trials', description: 'Trial registrations' },
    { name: 'Payments', description: 'Immutable payment records, receipts, refunds and voids' },
    { name: 'Contact', description: 'Public contact form' },
    { name: 'Member Auth', description: 'Member portal activation and authentication' },
    { name: 'Member Portal', description: 'Member-owned booking, progress, workout and requests' },
    { name: 'Trainers', description: 'Trainer management' },
    { name: 'Fitness Ops', description: 'Staff fitness operations and request approvals' },
    { name: 'Operations', description: 'Audit logs, operational reports and notification queue' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Staff JWT from POST /api/auth/login',
      },
      memberBearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Member JWT from POST /api/member-auth/login',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
        },
        required: ['success', 'message'],
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'owner@elite.mm' },
          password: { type: 'string', format: 'password', description: 'Staff password configured outside source control' },
        },
      },
      LoginResponse: {
        allOf: [
          { $ref: '#/components/schemas/ApiResponse' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  token: { type: 'string' },
                  role: { type: 'string', enum: ['owner', 'manager', 'reception', 'trainer', 'accountant'] },
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                },
              },
            },
          },
        ],
      },
      StaffProfile: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['owner', 'manager', 'reception', 'trainer', 'accountant'] },
          name: { type: 'string' },
        },
      },
      Member: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          code: { type: 'string', example: 'EM-2401' },
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          package: { type: 'string', example: 'Premium' },
          status: {
            type: 'string',
            enum: ['Active', 'Expired', 'Trial', 'Frozen'],
          },
          joinDate: { type: 'string', example: '12 Jan 2024' },
          expireDate: { type: 'string', example: '31 Dec 2026' },
          attendance: { type: 'integer' },
          avatar: { type: 'string' },
        },
      },
      CreateMemberRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          package: { type: 'string', example: 'Standard' },
          avatar: { type: 'string' },
        },
      },
      MemberActionRequest: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['freeze', 'renew', 'upgrade', 'downgrade', 'booking'],
          },
          package: { type: 'string', description: 'Target package code/name for upgrade or downgrade' },
        },
      },
      Checkin: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          memberId: { type: 'string' },
          memberName: { type: 'string' },
          time: { type: 'string', example: '08:42 AM' },
          membershipType: { type: 'string' },
        },
      },
      DashboardStats: {
        type: 'object',
        properties: {
          totalMembers: { type: 'integer' },
          activeMembers: { type: 'integer' },
          todayCheckins: { type: 'integer' },
          monthlyRevenue: { type: 'integer' },
        },
      },
      TrialRequest: {
        type: 'object',
        required: ['fullName', 'phone', 'package'],
        properties: {
          fullName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          package: { type: 'string', example: 'Basic' },
          startDate: { type: 'string', example: '01 Sep 2026' },
        },
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          memberId: { type: 'string' },
          memberName: { type: 'string' },
          package: { type: 'string' },
          amount: { type: 'integer' },
          status: {
            type: 'string',
            enum: ['Paid', 'Pending', 'Overdue'],
          },
          date: { type: 'string' },
          paymentMethod: { type: 'string' },
          referenceNo: { type: 'string', nullable: true },
          receiptNo: { type: 'string', nullable: true, example: 'RCPT-12345' },
          membershipAction: {
            type: 'string',
            enum: ['renew', 'upgrade', 'downgrade', ''],
            description: 'Membership change committed atomically with this paid receipt, when requested',
          },
        },
      },
      CreatePaymentRequest: {
        type: 'object',
        required: ['memberId', 'packageName', 'amount'],
        properties: {
          memberId: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
          packageName: { type: 'string' },
          amount: { type: 'number' },
          status: {
            type: 'string',
            enum: ['Paid', 'Pending', 'Overdue'],
            default: 'Paid',
          },
          paymentDate: { type: 'string' },
          paymentMethod: { type: 'string', default: 'Cash' },
          referenceNo: { type: 'string' },
          idempotencyKey: { type: 'string', description: 'Unique client-generated key used to safely retry payment creation' },
          membershipAction: {
            type: 'string',
            enum: ['renew', 'upgrade', 'downgrade'],
            description: 'Optional. Requires status=Paid. Receipt and membership change are committed in one transaction.',
          },
        },
      },
      ContactRequest: {
        type: 'object',
        additionalProperties: { type: 'string' },
        example: {
          name: 'Aung Min',
          phone: '+95 9 123 456 789',
          message: 'Interested in Premium membership',
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          data: { nullable: true },
          message: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Service status',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            status: { type: 'string', example: 'ok' },
                            database: {
                              type: 'string',
                              enum: ['connected', 'not_configured'],
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '503': {
            description: 'Database unreachable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['Operations'],
        summary: 'Readiness check; requires a reachable configured database',
        responses: {
          '200': { description: 'Service is ready' },
          '503': { description: 'Service or database is not ready' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Staff login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current staff profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Authenticated staff user',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/StaffProfile' },
                      },
                    },
                  ],
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change the authenticated staff password',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Password changed' }, '401': { description: 'Unauthorized or current password invalid' } },
      },
    },
    '/api/auth/staff': {
      get: {
        tags: ['Auth'],
        summary: 'List staff accounts (owner only)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Staff list' }, '403': { description: 'Owner role required' } },
      },
      post: {
        tags: ['Auth'],
        summary: 'Create staff account (owner only)',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Staff account created' }, '403': { description: 'Owner role required' }, '409': { description: 'Email already exists' } },
      },
    },
    '/api/auth/staff/{id}': {
      patch: {
        tags: ['Auth'],
        summary: 'Update or enable/disable a staff account (owner only; last owner is protected)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Staff account updated' }, '403': { description: 'Owner role required' }, '409': { description: 'Protected last owner or duplicate email' } },
      },
    },
    '/api/auth/staff/{id}/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset a staff password (owner only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Password reset' }, '403': { description: 'Owner role required' } },
      },
    },
    '/api/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Dashboard overview',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Stats and recent check-ins',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            stats: {
                              $ref: '#/components/schemas/DashboardStats',
                            },
                            recentCheckins: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/Checkin' },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/members': {
      get: {
        tags: ['Members'],
        summary: 'List members',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['Active', 'Expired', 'Trial', 'Frozen'],
            },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 100 },
          },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['name', 'joinDate', 'status'],
              default: 'name',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Member list',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Member' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Members'],
        summary: 'Create member',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateMemberRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Member created',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Member' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/members/{id}': {
      get: {
        tags: ['Members'],
        summary: 'Get member by ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'Member details',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Member' },
                      },
                    },
                  ],
                },
              },
            },
          },
          '404': {
            description: 'Member not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/members/{id}/actions': {
      post: {
        tags: ['Members'],
        summary: 'Perform membership action',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MemberActionRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated member',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Member' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/members/{id}/checkins': {
      post: {
        tags: ['Members'],
        summary: 'Check in member',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'Check-in record',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Checkin' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/trials': {
      post: {
        tags: ['Trials'],
        summary: 'Register trial (public)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TrialRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Trial saved',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' },
              },
            },
          },
        },
      },
    },
    '/api/trials/{id}': {
      get: {
        tags: ['Trials'],
        summary: 'Get trial registration',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'Trial details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' },
              },
            },
          },
        },
      },
    },
    '/api/payments': {
      get: {
        tags: ['Payments'],
        summary: 'List payments',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['Paid', 'Pending', 'Overdue'],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Payment list',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Payment' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Payments'],
        summary: 'Record payment (payment.create permission)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePaymentRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Payment recorded',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/Payment' },
                      },
                    },
                  ],
                },
              },
            },
          },
          '403': {
            description: 'Requires owner role',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/member-auth/activate': {
      post: { tags: ['Member Auth'], summary: 'Activate a member portal account using member code + registered phone', responses: { '201': { description: 'Portal activated' }, '409': { description: 'Already activated' } } },
    },
    '/api/member-auth/login': {
      post: { tags: ['Member Auth'], summary: 'Member portal login', responses: { '200': { description: 'Member JWT + member profile' }, '401': { description: 'Invalid credentials' } } },
    },
    '/api/member-auth/me': {
      get: { tags: ['Member Auth'], summary: 'Current authenticated member', security: [{ memberBearerAuth: [] }], responses: { '200': { description: 'Member profile' }, '401': { description: 'Unauthorized' } } },
    },
    '/api/member-auth/change-password': {
      post: { tags: ['Member Auth'], summary: 'Change member portal password', security: [{ memberBearerAuth: [] }], responses: { '200': { description: 'Password changed' } } },
    },
    '/api/trainers': {
      get: { tags: ['Trainers'], summary: 'List trainers', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Trainer list' } } },
      post: { tags: ['Trainers'], summary: 'Create trainer (owner only)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Trainer created' }, '403': { description: 'Owner role required' } } },
    },
    '/api/trainers/{id}': {
      patch: { tags: ['Trainers'], summary: 'Update/enable/disable trainer (owner only)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Trainer updated' } } },
    },
    '/api/portal/bookings': {
      get: { tags: ['Member Portal'], summary: 'List authenticated member bookings', security: [{ memberBearerAuth: [] }], responses: { '200': { description: 'Booking list' } } },
      post: { tags: ['Member Portal'], summary: 'Book a session; rejects member/trainer time collisions', security: [{ memberBearerAuth: [] }], responses: { '201': { description: 'Session booked' }, '409': { description: 'Booking conflict or membership unavailable' } } },
    },
    '/api/portal/progress': {
      get: { tags: ['Member Portal'], summary: 'Authenticated member progress history', security: [{ memberBearerAuth: [] }], responses: { '200': { description: 'Progress history' } } },
    },
    '/api/portal/workout': {
      get: { tags: ['Member Portal'], summary: 'Authenticated member active workout plan', security: [{ memberBearerAuth: [] }], responses: { '200': { description: 'Active plan or null' } } },
    },
    '/api/portal/requests': {
      get: { tags: ['Member Portal'], summary: 'Member membership-request history', security: [{ memberBearerAuth: [] }], responses: { '200': { description: 'Request history' } } },
      post: { tags: ['Member Portal'], summary: 'Submit freeze/renew/upgrade request for staff approval', security: [{ memberBearerAuth: [] }], responses: { '201': { description: 'Request submitted' }, '409': { description: 'Matching request already pending' } } },
    },
    '/api/fitness/requests': {
      get: { tags: ['Fitness Ops'], summary: 'List pending member requests', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Pending requests' } } },
    },
    '/api/fitness/requests/{id}/resolve': {
      post: { tags: ['Fitness Ops'], summary: 'Approve or reject a pending member request transactionally', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Request resolved' }, '404': { description: 'Pending request not found/already resolved' } } },
    },
    '/api/fitness/members/{id}/progress': {
      post: { tags: ['Fitness Ops'], summary: 'Record member body progress', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '201': { description: 'Progress recorded' } } },
    },
    '/api/fitness/members/{id}/workout': {
      put: { tags: ['Fitness Ops'], summary: 'Publish active workout plan for member', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Workout plan saved' } } },
    },
    '/api/fitness/members/{id}/trainer': {
      put: { tags: ['Fitness Ops'], summary: 'Assign active trainer to member', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Trainer assignment saved' } } },
    },
    '/api/ops/audit': {
      get: { tags: ['Operations'], summary: 'Owner-only audit log', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Audit records' }, '403': { description: 'Owner role required' } } },
    },
    '/api/packages': {
      get: { tags: ['Packages'], summary: 'List active membership packages (public)', responses: { '200': { description: 'Active package list' } } },
      post: { tags: ['Packages'], summary: 'Create membership package', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Package created' }, '403': { description: 'Requires package.manage permission' } } },
    },
    '/api/packages/admin': {
      get: { tags: ['Packages'], summary: 'List all membership packages for administration', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Package list' }, '403': { description: 'Requires package.manage permission' } } },
    },
    '/api/packages/{id}': {
      patch: { tags: ['Packages'], summary: 'Update package rules or price', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Package updated' } } },
    },
    '/api/packages/{id}/prices': {
      get: { tags: ['Packages'], summary: 'Package price history', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Price history' } } },
    },
    '/api/payments/{id}/adjustments': {
      get: { tags: ['Payments'], summary: 'List immutable refund/void adjustments', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Adjustment history' } } },
      post: { tags: ['Payments'], summary: 'Record refund or void without mutating the original receipt', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Adjustment recorded' }, '403': { description: 'Requires payment.adjust permission' }, '409': { description: 'Adjustment exceeds remaining balance or invalid void' } } },
    },
    '/api/members/{id}/overview': {
      get: { tags: ['Members'], summary: 'Member command-center overview', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Profile, payments, check-ins, bookings, requests, trainer, progress, workout and notes' } } },
    },
    '/api/members/{id}/notes': {
      get: { tags: ['Members'], summary: 'List append-only staff notes', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Member notes' } } },
      post: { tags: ['Members'], summary: 'Append staff note', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '201': { description: 'Note added' }, '403': { description: 'Requires member.notes permission' } } },
    },
    '/api/trainers/{id}/availability': {
      get: { tags: ['Trainers'], summary: 'Trainer weekly availability', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Availability slots' } } },
      put: { tags: ['Trainers'], summary: 'Replace trainer weekly availability', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Availability saved' } } },
    },
    '/api/trainers/{id}/time-off': {
      get: { tags: ['Trainers'], summary: 'Trainer time-off list', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Time-off list' } } },
      post: { tags: ['Trainers'], summary: 'Add trainer time off', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '201': { description: 'Time off saved' } } },
    },
    '/api/trainers/{id}/calendar': {
      get: { tags: ['Trainers'], summary: 'Trainer booking calendar', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Calendar bookings' } } },
    },
    '/api/fitness/bookings/{id}/status': {
      patch: { tags: ['Fitness Ops'], summary: 'Mark booked session Completed, Cancelled or NoShow', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Booking status updated' }, '403': { description: 'Requires fitness.write permission' } } },
    },
    '/api/ops/reports': {
      get: { tags: ['Operations'], summary: 'Net operational report (gross less refunds/voids)', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Revenue, membership, trial, attendance, package and trainer metrics' }, '403': { description: 'Requires reports.view permission' } } },
    },
    '/api/ops/notifications': {
      get: { tags: ['Operations'], summary: 'Staff internal notification queue', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Notifications visible to current staff' } } },
    },
    '/api/ops/notifications/generate': {
      post: { tags: ['Operations'], summary: 'Generate deduplicated operational notifications', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Generation summary' }, '403': { description: 'Requires notifications.manage permission' } } },
    },
    '/api/portal/notifications': {
      get: { tags: ['Member Portal'], summary: 'Authenticated member notifications', security: [{ memberBearerAuth: [] }], responses: { '200': { description: 'Member notification list' } } },
    },
    '/api/contact': {
      post: {
        tags: ['Contact'],
        summary: 'Submit contact message (public)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ContactRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Message accepted',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { type: 'boolean', example: true },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
} as const
