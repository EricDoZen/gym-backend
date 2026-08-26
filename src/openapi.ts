export const openApiDoc = {
  openapi: '3.0.3',
  info: {
    title: 'Elite Myanmar Gym API',
    version: '0.1.0',
    description:
      'REST API for Elite Myanmar gym management. Authenticated routes require a JWT from `POST /api/auth/login`.',
  },
  servers: [{ url: 'http://localhost:8787', description: 'Local development' }],
  tags: [
    { name: 'Health', description: 'Service health checks' },
    { name: 'Auth', description: 'Staff authentication' },
    { name: 'Dashboard', description: 'Owner dashboard metrics' },
    { name: 'Members', description: 'Member management and check-ins' },
    { name: 'Trials', description: 'Trial registrations' },
    { name: 'Payments', description: 'Payment records' },
    { name: 'Contact', description: 'Public contact form' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT from POST /api/auth/login',
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
          password: { type: 'string', example: 'owner123' },
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
                  role: { type: 'string', enum: ['owner', 'reception'] },
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
          role: { type: 'string', enum: ['owner', 'reception'] },
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
            enum: ['freeze', 'renew', 'upgrade', 'booking'],
          },
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
        summary: 'Record payment (owner only)',
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
